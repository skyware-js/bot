import {
	type AppBskyEmbedExternal,
	type AppBskyEmbedImages,
	type AppBskyEmbedRecord,
	type AppBskyEmbedRecordWithMedia,
	AppBskyFeedDefs,
	AppBskyFeedPost,
	type AppBskyFeedThreadgate,
	type AppBskyRichtextFacet,
	type AtpServiceClient,
	type AtpSessionData,
	AtUri,
	type BlobRef,
	BskyAgent,
	type ComAtprotoLabelDefs,
	type ComAtprotoServerCreateSession,
	type ComAtprotoServerGetSession,
} from "@atproto/api";
import { EventEmitter } from "node:events";
import type QuickLRU from "quick-lru";
import { RateLimitThreshold } from "rate-limit-threshold";
import { facetAwareSegment } from "../richtext/facetAwareSegment.js";
import { graphemeLength, RichText } from "../richtext/RichText.js";
import { FeedGenerator } from "../struct/FeedGenerator.js";
import { List } from "../struct/List.js";
import { Post } from "../struct/post/Post.js";
import type { PostPayload } from "../struct/post/PostPayload.js";
import { PostReference } from "../struct/post/PostReference.js";
import { Profile } from "../struct/Profile.js";
import { BotEventEmitter, type BotEventEmitterOptions, EventStrategy } from "./BotEventEmitter.js";
import { type CacheOptions, makeCache } from "./cache.js";

const NO_SESSION_ERROR = "Active session not found. Make sure to call the login method first.";

/**
 * Options for the Bot constructor.
 */
export interface BotOptions {
	/**
	 * The PDS to connect to.
	 * @default "https://bsky.social"
	 */
	service?: string;

	/**
	 * The default list of languages to attach to posts.
	 * @default ["en"]
	 */
	langs?: Array<string>;

	/**
	 * Whether to emit events.
	 * @default true
	 */
	emitEvents?: boolean;

	/** Options for the built-in rate limiter. */
	rateLimitOptions?: RateLimitOptions;

	/** Options for the request cache. */
	cacheOptions?: CacheOptions;

	/** Options for the event emitter. */
	eventEmitterOptions?: BotEventEmitterOptions;
}

/**
 * A bot that can interact with the Bluesky API.
 */
export class Bot extends EventEmitter {
	/** The agent used to communicate with the Bluesky API. */
	private readonly agent: BskyAgent;

	/** A limiter to rate limit API requests. */
	private readonly limiter: RateLimitThreshold;

	/** A cache to store API responses. */
	private readonly cache: BotCache;

	/** Receives and emits events.. */
	private readonly eventEmitter?: BotEventEmitter;

	/** The Bluesky API client, with rate-limited methods. */
	readonly api: AtpServiceClient;

	/** The default list of languages to attach to posts. */
	langs: Array<string> = [];

	/** The bot account's Bluesky profile. */
	profile!: Profile;

	/**
	 * Create a new bot.
	 * @param options Configuration options.
	 */
	constructor(
		{
			service = "https://bsky.social",
			langs = ["en"],
			emitEvents = true,
			rateLimitOptions,
			cacheOptions,
			eventEmitterOptions = { strategy: EventStrategy.Polling },
		}: BotOptions = {},
	) {
		super();

		this.agent = new BskyAgent({ service });

		this.langs = langs;

		this.limiter = new RateLimitThreshold(
			3000,
			(rateLimitOptions?.rateLimitInterval ?? 300) * 1000,
		);

		this.cache = {
			profiles: makeCache(cacheOptions),
			posts: makeCache(cacheOptions),
			lists: makeCache({ maxEntries: 100, ...cacheOptions }),
			feeds: makeCache({ maxEntries: 50, ...cacheOptions }),
		};

		if (emitEvents) {
			this.eventEmitter = new BotEventEmitter(eventEmitterOptions, this);
			this.eventEmitter.on("open", () => this.emit("open"));
			this.eventEmitter.on("error", (error) => this.emit("error", error));
			this.eventEmitter.on("close", () => this.emit("close"));
			this.eventEmitter.on("reply", (event) => this.emit("reply", event));
			this.eventEmitter.on("quote", (event) => this.emit("quote", event));
			this.eventEmitter.on("mention", (event) => this.emit("mention", event));
			this.eventEmitter.on("repost", (event) => this.emit("repost", event));
			this.eventEmitter.on("like", (event) => this.emit("like", event));
			this.eventEmitter.on("follow", (event) => this.emit("follow", event));
		}

		this.api = this.agent.api = rateLimitApi(this.agent.api, this.limiter);
	}

	/** Whether the bot has an active session. */
	get hasSession() {
		return this.agent.hasSession;
	}

	/**
	 * Log in with an identifier and password.
	 * @param options The bot account's identifier and password.
	 * @returns Session data.
	 */
	async login(
		{ identifier, password }: BotLoginOptions,
	): Promise<ComAtprotoServerCreateSession.OutputSchema> {
		if (identifier[0] === "@") identifier = identifier.slice(1);

		const response = await this.agent.login({ identifier, password }).catch((e) => {
			throw new Error("Failed to log in — double check your credentials and try again.", {
				cause: e,
			});
		});

		this.profile = await this.getProfile(response.data.did).catch((e) => {
			throw new Error("Failed to fetch bot profile. Error:\n" + e);
		});

		return response.data;
	}

	/**
	 * Resume an existing session.
	 * @param session Session data.
	 * @returns Updated session data.
	 */
	async resumeSession(session: AtpSessionData): Promise<ComAtprotoServerGetSession.OutputSchema> {
		const response = await this.agent.resumeSession(session).catch((e) => {
			throw new Error("Failed to resume session.", { cause: e });
		});
		this.profile = await this.getProfile(response.data.did);
		return response.data;
	}

	/**
	 * Fetch a post by its AT URI.
	 * @param uri The post's AT URI.
	 * @param options Optional configuration.
	 */
	async getPost(uri: string, options: BotGetPostOptions = {}): Promise<Post> {
		options = { parentHeight: 1, depth: 1, ...options };

		if (!options.skipCache && this.cache.posts.has(uri)) return this.cache.posts.get(uri)!;

		const postThread = await this.agent.getPostThread({
			uri,
			parentHeight: options.parentHeight!,
			depth: options.depth!,
		}).catch((e) => {
			throw new Error(`Failed to fetch post ${uri}`, { cause: e });
		});

		if (!AppBskyFeedDefs.isThreadViewPost(postThread.data.thread)) {
			if (this.cache.posts.has(uri)) this.cache.posts.delete(uri);
			throw new Error(
				`Could not find post ${uri}. The bot may be blocked from viewing it, or the post may have been deleted.`,
			);
		}

		const post = Post.fromThreadView(postThread.data.thread, this);

		if (!options.noCacheResponse) this.cache.posts.set(uri, post);
		return post;
	}

	/**
	 * Fetch up to 25 posts by their AT URIs.
	 * @param uris The URIs of the posts to fetch.
	 * @param options Optional configuration.
	 */
	async getPosts(uris: Array<string>, options: BotGetPostsOptions = {}): Promise<Array<Post>> {
		if (!uris.length) return [];
		if (uris.length > 25) throw new Error("You can only fetch up to 25 posts at a time.");

		if (!options.skipCache && uris.every((uri) => this.cache.posts.has(uri))) {
			return uris.map((uri) => this.cache.posts.get(uri)!);
		}

		const postViews = await this.agent.getPosts({ uris }).catch((e) => {
			throw new Error(
				"Failed to fetch posts at URIs:\n" + uris.slice(0, 3).join("\n") + "\n...",
				{ cause: e },
			);
		});

		const posts: Array<Post> = [];
		for (const postView of postViews.data.posts) {
			if (!AppBskyFeedPost.isRecord(postView.record)) continue;
			const post = Post.fromView(postView, this);
			if (!options.noCacheResponse) this.cache.posts.set(post.uri, post);
			posts.push(post);
		}

		return posts;
	}

	/**
	 * Fetch up to 100 (default 100) posts by a user's DID.
	 * @param did The user's DID.
	 * @param options Optional configuration.
	 * @returns The user's posts and, if there are more posts to fetch, a cursor.
	 */
	async getUserPosts(
		did: string,
		options: BotGetUserPostsOptions = {},
	): Promise<{ cursor: string | undefined; posts: Array<Post> }> {
		const response = await this.agent.getAuthorFeed({
			actor: did,
			filter: GetUserPostsFilter.PostsWithReplies,
			...options,
		}).catch((e) => {
			throw new Error("Failed to fetch user posts.", { cause: e });
		});

		const posts: Array<Post> = [];
		for (const feedViewPost of response.data.feed) {
			const post = Post.fromView(feedViewPost.post, this);
			if (!options.noCacheResponse) this.cache.posts.set(post.uri, post);
			posts.push(post);
		}

		return { cursor: response.data.cursor, posts };
	}

	/**
	 * Fetch up to 100 (default 100) posts liked by a user.
	 * @param did The user's DID.
	 * @param options Optional configuration.
	 */
	async getUserLikes(
		did: string,
		options: BotGetUserLikesOptions = {},
	): Promise<{ cursor: string | undefined; posts: Array<Post> }> {
		const response = await this.agent.getActorLikes({ actor: did, ...options }).catch((e) => {
			throw new Error("Failed to fetch user likes.", { cause: e });
		});

		const posts: Array<Post> = [];
		for (const feedViewPost of response.data.feed) {
			const post = Post.fromView(feedViewPost.post, this);
			if (!options.noCacheResponse) this.cache.posts.set(post.uri, post);
			posts.push(post);
		}

		return { cursor: response.data.cursor, posts };
	}

	/**
	 * Fetch a profile by DID or handle.
	 * @param didOrHandle The user's DID or handle.
	 * @param options Optional configuration.
	 */
	async getProfile(didOrHandle: string, options: BotGetProfileOptions = {}): Promise<Profile> {
		if (!options.skipCache && this.cache.profiles.has(didOrHandle)) {
			return this.cache.profiles.get(didOrHandle)!;
		}

		const profileView = await this.agent.getProfile({ actor: didOrHandle }).catch((e) => {
			throw new Error(`Failed to fetch profile ${didOrHandle}.`, { cause: e });
		});

		const profile = Profile.fromView(profileView.data, this);
		if (!options.noCacheResponse) this.cache.profiles.set(didOrHandle, profile);
		return profile;
	}

	/**
	 * Fetch a list by its AT URI.
	 * @param uri The list's AT URI.
	 * @param options Optional configuration.
	 */
	async getList(uri: string, options: BotGetListOptions = {}): Promise<List> {
		if (!options.skipCache && this.cache.lists.has(uri)) {
			return this.cache.lists.get(uri)!;
		}

		const response = await this.api.app.bsky.graph.getList({ list: uri }).catch((e) => {
			throw new Error(`Failed to fetch list ${uri}`, { cause: e });
		});

		const list = List.fromView(response.data.list, this);
		list.items = response.data.items.map(({ subject }) => Profile.fromView(subject, this));

		if (!options.noCacheResponse) this.cache.lists.set(uri, list);
		return list;
	}

	/**
	 * Fetch all (up to 100, default 100) lists created by a user.
	 * @param did The user's DID.
	 * @param options Optional configuration.
	 */
	async getUserLists(
		did: string,
		options: BotGetUserListsOptions,
	): Promise<{ cursor: string | undefined; lists: Array<List> }> {
		const response = await this.api.app.bsky.graph.getLists({ actor: did, ...options }).catch(
			(e) => {
				throw new Error(`Failed to fetch user lists for ${did}.`, { cause: e });
			},
		);

		const lists = response.data.lists.map((listView) => {
			const list = List.fromView(listView, this);
			this.cache.lists.set(list.uri, list);
			return list;
		});

		return { cursor: response.data.cursor, lists };
	}

	/**
	 * Fetch a feed generator by its AT URI.
	 * @param uri The feed generator's AT URI.
	 * @param options Optional configuration.
	 */
	async getFeedGenerator(
		uri: string,
		options: BotGetFeedGeneratorOptions = {},
	): Promise<FeedGenerator> {
		if (!options.skipCache && this.cache.feeds.has(uri)) {
			return this.cache.feeds.get(uri)!;
		}

		const response = await this.api.app.bsky.feed.getFeedGenerator({ feed: uri }).catch((e) => {
			throw new Error(`Failed to fetch feed generator ${uri}`, { cause: e });
		});

		const feed = FeedGenerator.fromView(response.data.view, this);
		feed.isOnline = response.data.isOnline;
		if (!options.noCacheResponse) this.cache.feeds.set(uri, feed);
		return feed;
	}

	/**
	 * Fetch a list of feed generators by their AT URIs.
	 * @param uris The URIs of the feed generators to fetch.
	 * @param options Optional configuration.
	 */
	async getFeedGenerators(
		uris: Array<string>,
		options: BotGetFeedGeneratorsOptions = {},
	): Promise<Array<FeedGenerator>> {
		if (!uris.length) return [];

		const feedViews = await this.api.app.bsky.feed.getFeedGenerators({ feeds: uris }).catch(
			(e) => {
				throw new Error(
					"Failed to fetch feed generators at URIs:\n" + uris.slice(0, 3).join("\n")
						+ "\n...",
					{ cause: e },
				);
			},
		);

		return feedViews.data.feeds.map((feedView) => {
			const feed = FeedGenerator.fromView(feedView, this);
			if (!options.noCacheResponse) this.cache.feeds.set(feed.uri, feed);
			return feed;
		});
	}

	/**
	 * Get the bot's home timeline.
	 * @param options Optional configuration.
	 */
	async getTimeline(options: BotGetTimelineOptions = {}): Promise<Array<Post>> {
		const response = await this.agent.getTimeline(options).catch((e) => {
			throw new Error("Failed to fetch timeline.", { cause: e });
		});

		return response.data.feed.map((feedViewPost) => {
			const post = Post.fromView(feedViewPost.post, this);
			if (!options.noCacheResponse) this.cache.posts.set(post.uri, post);
			return post;
		});
	}

	/**
	 * Create a post.
	 * @param payload The post payload.
	 * @param options Optional configuration.
	 * @returns A reference to the created post.
	 */
	async post(payload: PostPayload, options: BotPostOptions = {}): Promise<PostReference> {
		options.resolveFacets ??= true;

		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);

		// Use default langs if none are provided (an explicit empty array will be ignored)
		payload.langs ??= this.langs;
		// Use current time if none is provided
		payload.createdAt ??= new Date();

		// Resolve facets if necessary
		let text: string, facets: Array<AppBskyRichtextFacet.Main> = [];
		if (payload.text instanceof RichText) {
			({ text, facets } = payload.text.build());
		} else if (options.resolveFacets) {
			text = payload.text;
			facets = await RichText.detectFacets(text, this);
		} else {
			text = payload.text;
		}

		if (graphemeLength(text) > 300) {
			if (!options.splitLongPost) {
				throw new Error("Post exceeds maximum length of 300 graphemes.");
			}

			const segments = facetAwareSegment(text, 300, facets);
			if (segments.length <= 1) {
				throw new Error("Post is too long and could not be split into shorter posts.");
			}
			const { text: postText, facets: postFacets } = segments.shift()!;
			const firstPost = await this.post(
				{ ...payload, text: postText, facets: postFacets },
				options,
			);

			let previousPost = firstPost;

			while (segments.length) {
				const { text: replyText, facets: replyFacets } = segments.shift()!;

				const root = payload.replyRef?.root ?? { uri: firstPost.uri, cid: firstPost.cid };

				// We don't want to copy over the entire payload; for instance, images, tags, embed, threadgate should only be on the first post
				previousPost = await this.post({
					text: replyText,
					facets: replyFacets,
					labels: payload.labels,
					langs: payload.langs,
					createdAt: payload.createdAt,

					replyRef: { parent: { uri: previousPost.uri, cid: previousPost.cid }, root },
				}, { ...options });
			}

			return firstPost;
		}

		// Create post labels
		const labels = payload.labels?.length
			? {
				$type: "com.atproto.label.defs#selfLabels",
				values: payload.labels.map((label) => ({ val: label })),
			} satisfies ComAtprotoLabelDefs.SelfLabels
			: undefined;

		if (payload.images?.length && payload.quoted && !(payload.quoted instanceof Post)) {
			throw new Error("Only a post can be embedded alongside images.");
		}

		// Upload image blobs
		const images: Array<AppBskyEmbedImages.Image> = [];
		if (payload.images?.length) {
			for (const image of payload.images) {
				if (!image?.data.byteLength) throw new Error("Can't upload an empty image");

				image.alt ??= "";

				const imageResponse = await this.agent.uploadBlob(image.data).catch((e) => {
					throw new Error("Failed to upload image\n" + e);
				});

				const { blob } = imageResponse.data;

				if (!blob.mimeType.startsWith("image/")) {
					throw new Error("Uploaded blob is not an image");
				}

				images.push({ ...image, alt: image.alt, image: blob });
			}
		}

		// Construct the post embed
		let embed: AppBskyFeedPost.Record["embed"] | undefined;

		if (payload.quoted) {
			const record = {
				$type: "app.bsky.embed.record",
				record: { uri: payload.quoted.uri, cid: payload.quoted.cid },
			} satisfies AppBskyEmbedRecord.Main;
			embed = images.length
				? {
					$type: "app.bsky.embed.recordWithMedia",
					record,
					media: { $type: "app.bsky.embed.images", images },
				} satisfies AppBskyEmbedRecordWithMedia.Main
				: record;
		} else if (payload.external) {
			let thumbBlob: BlobRef | undefined;

			if (payload.external.thumb?.data.byteLength) {
				const thumbResponse = await this.agent.uploadBlob(payload.external.thumb.data)
					.catch((e) => {
						throw new Error("Failed to upload thumbnail\n" + e);
					});
				thumbBlob = thumbResponse.data.blob;

				if (!thumbBlob?.mimeType.startsWith("image/")) {
					throw new Error("Uploaded blob is not an image");
				}
			}

			embed = {
				$type: "app.bsky.embed.external",
				external: {
					title: payload.external.title,
					uri: payload.external.uri,
					description: payload.external.description,
					...(thumbBlob ? { thumb: thumbBlob } : {}),
				},
			} satisfies AppBskyEmbedExternal.Main;
		} else if (images.length) {
			embed = { $type: "app.bsky.embed.images", images } satisfies AppBskyEmbedImages.Main;
		}

		// Put together the post record
		const postRecord: AppBskyFeedPost.Record = {
			$type: "app.bsky.feed.post",
			text,
			facets,
			createdAt: payload.createdAt.toISOString(),
			langs: payload.langs,
		};
		// @ts-expect-error — AppBskyFeedPopst.ReplyRef has a string index signature
		if (payload.replyRef) postRecord.reply = payload.replyRef;
		if (embed) postRecord.embed = embed;
		if (labels) postRecord.labels = labels;
		if (payload.tags?.length) postRecord.tags = payload.tags;

		const { uri: postUri, cid: postCid } = await this.createRecord(
			"app.bsky.feed.post",
			postRecord,
		).catch((e) => {
			throw new Error("Error when uploading post.", { cause: e });
		});

		// Threadgate is a separate record
		if (payload.threadgate) {
			const { rkey } = new AtUri(postUri);
			const allow: AppBskyFeedThreadgate.Record["allow"] = [];

			if (payload.threadgate.allowFollowing) {
				allow.push({ $type: "app.bsky.feed.threadgate#followingRule" });
			}
			if (payload.threadgate.allowMentioned) {
				allow.push({ $type: "app.bsky.feed.threadgate#mentionRule" });
			}
			payload.threadgate.allowLists?.forEach((list) => {
				allow.push({
					$type: "app.bsky.feed.threadgate#listRule",
					list: typeof list === "string" ? list : list.uri,
				});
			});

			const threadgateRecord: AppBskyFeedThreadgate.Record = {
				$type: "app.bsky.feed.threadgate",
				createdAt: new Date().toISOString(),
				post: postUri,
				allow,
			};

			// Threadgate rkey must equal the post's rkey
			await this.createRecord("app.bsky.feed.threadgate", threadgateRecord, rkey).catch(
				(e) => {
					throw new Error(`Failed to create threadgate on post ${postUri}.`, {
						cause: e,
					});
				},
			);
		}

		return new PostReference({ uri: postUri, cid: postCid, replyRef: payload.replyRef }, this);
	}

	/**
	 * Delete a post.
	 * @param uri The post's AT URI.
	 */
	async deletePost(uri: string): Promise<void> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);

		await this.deleteRecord(uri).catch((e) => {
			throw new Error(`Failed to delete post ${uri}.`, { cause: e });
		}).finally(() => this.cache.posts.delete(uri));
	}

	/**
	 * Like a post or feed generator.
	 * @param reference The post or feed generator to like.
	 * @returns The like record's AT URI and CID.
	 */
	async like({ uri, cid }: StrongRef): Promise<StrongRef> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);

		return this.agent.like(uri, cid).catch((e) => {
			throw new Error(`Failed to like post ${uri}.`, { cause: e });
		});
	}

	/**
	 * Delete a like.
	 * @param uri The liked record's AT URI or the like record's AT URI.
	 */
	async unlike(uri: string): Promise<void> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);

		const likeUri = uri.includes("app.bsky.feed.like")
			? uri
			: uri.includes("app.bsky.feed.generator")
			? (await this.getFeedGenerator(uri)).likeUri
			: (await this.getPost(uri)).likeUri;
		if (!likeUri) return;

		await this.deleteRecord(likeUri).catch((e) => {
			throw new Error(
				`Failed to delete like ${likeUri}` + likeUri === uri ? "." : ` for record ${uri}.`,
				{ cause: e },
			);
		});
	}

	/**
	 * Repost a post.
	 * @param reference The post to repost.
	 * @returns The repost record's AT URI and CID.
	 */
	async repost({ uri, cid }: StrongRef): Promise<StrongRef> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);

		return this.agent.repost(uri, cid).catch((e) => {
			throw new Error(`Failed to repost post ${uri}.`, { cause: e });
		});
	}

	/**
	 * Delete a repost.
	 * @param uri The post's AT URI or the repost record's AT URI.
	 */
	async deleteRepost(uri: string): Promise<void> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);

		const repostUri = uri.includes("app.bsky.feed.repost")
			? uri
			: (await this.getPost(uri)).repostUri;
		if (!repostUri) return;

		await this.deleteRecord(repostUri).catch((e) => {
			throw new Error(
				`Failed to delete repost ${repostUri}` + repostUri === uri
					? "."
					: ` for post ${uri}.`,
				{ cause: e },
			);
		});
	}

	/**
	 * Follow a user.
	 * @param did The user's DID.
	 * @returns The follow record's AT URI and CID.
	 */
	async follow(did: string): Promise<StrongRef> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);

		return this.agent.follow(did).catch((e) => {
			throw new Error(`Failed to follow user ${did}.`, { cause: e });
		});
	}

	/**
	 * Delete a follow.
	 * @param didOrUri The user's DID or the follow record's AT URI.
	 */
	async unfollow(didOrUri: string): Promise<void> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);

		let followUri: string;

		if (didOrUri.startsWith("at://")) followUri = didOrUri;
		else {
			const user = await this.getProfile(didOrUri);
			if (!user) throw new Error(`User ${didOrUri} not found.`);
			if (!user.followUri) return;
			followUri = user.followUri;
		}

		await this.deleteRecord(followUri).catch((e) => {
			throw new Error(
				`Failed to delete follow ${didOrUri}` + followUri === didOrUri
					? "."
					: ` for user ${didOrUri}.`,
				{ cause: e },
			);
		});
	}

	/**
	 * Mute a user.
	 * @param did The user's DID.
	 */
	async mute(did: string): Promise<void> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);
		await this.agent.mute(did).catch((e) => {
			throw new Error(`Failed to mute user ${did}.`, { cause: e });
		});
	}

	/**
	 * Delete a mute.
	 * @param did The user's DID.
	 */
	async unmute(did: string): Promise<void> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);
		await this.agent.unmute(did).catch((e) => {
			throw new Error(`Failed to delete mute for user ${did}.`, { cause: e });
		});
	}

	/**
	 * Block a user.
	 * @param did The user's DID.
	 * @returns The block record's AT URI and CID.
	 */
	async block(did: string): Promise<StrongRef> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);
		return this.createRecord("app.bsky.graph.block", { subject: did }).catch((e) => {
			throw new Error(`Failed to block user ${did}.`, { cause: e });
		});
	}

	/**
	 * Delete a block.
	 * @param didOrUri The user's DID or the block record's AT URI.
	 */
	async unblock(didOrUri: string): Promise<void> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);

		let blockUri: string;

		if (didOrUri.startsWith("at://")) blockUri = didOrUri;
		else {
			const user = await this.getProfile(didOrUri);
			if (!user) throw new Error(`User ${didOrUri} not found.`);
			if (!user.blockUri) return;
			blockUri = user.blockUri;
		}

		await this.deleteRecord(blockUri).catch((e) => {
			throw new Error(
				`Failed to delete block ${didOrUri}` + blockUri === didOrUri
					? "."
					: ` for user ${didOrUri}.`,
				{ cause: e },
			);
		});
	}

	/**
	 * Resolve a handle to a DID.
	 * @param handle The handle to resolve.
	 * @returns The user's DID.
	 */
	async resolveHandle(handle: string): Promise<string> {
		const response = await this.agent.resolveHandle({ handle }).catch((e) => {
			throw new Error(`Failed to resolve handle ${handle}`, { cause: e });
		});
		return response.data.did;
	}

	/**
	 * Update the bot's handle.
	 * @param handle The new handle.
	 */
	async updateHandle(handle: string): Promise<void> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);
		await this.agent.updateHandle({ handle }).catch((e) => {
			throw new Error("Failed to update handle.", { cause: e });
		});
		this.profile.handle = handle;
	}

	/**
	 * Create a record.
	 * @param nsid The collection's NSID.
	 * @param record The record to create.
	 * @param rkey The rkey to use.
	 * @returns The record's AT URI and CID.
	 */
	async createRecord(nsid: string, record: object, rkey?: string): Promise<StrongRef> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);
		const response = await this.api.com.atproto.repo.createRecord({
			collection: nsid,
			record: { $type: nsid, createdAt: new Date().toISOString(), ...record },
			repo: this.profile.did,
			...(rkey ? { rkey } : {}),
		});
		return response.data;
	}

	/**
	 * Delete a record.
	 * @param uri The record's AT URI.
	 */
	async deleteRecord(uri: string): Promise<void> {
		const { host: repo, collection, rkey } = new AtUri(uri);
		if (repo !== this.profile.did) throw new Error("Can only delete own record.");
		await this.api.com.atproto.repo.deleteRecord({ collection, repo, rkey });
	}

	/** Emitted when the bot begins listening for events. */
	override on(event: "open", listener: () => void): this;
	/** Emitted when an error occurs while listening for events. */
	override on(event: "error", listener: (error: unknown) => void): this;
	/** Emitted when the bot stops listening for events. */
	override on(event: "close", listener: () => void): this;
	/** Emitted when the bot receives a reply. */
	override on(event: "reply", listener: (post: Post) => void): this;
	/** Emitted when the bot receives a quote post. */
	override on(event: "quote", listener: (post: Post) => void): this;
	/** Emitted when the bot is mentioned. */
	override on(event: "mention", listener: (post: Post) => void): this;
	/**
	 * Emitted when one of the bot's posts is reposted.
	 * @param listener A callback function that receives the post that was reposted, the user who reposted it, and the repost's AT URI.
	 */
	override on(
		event: "repost",
		listener: (event: { post: Post; user: Profile; uri: string }) => void,
	): this;
	/**
	 * Emitted when one of the bot's posts is liked.
	 * @param listener A callback function that receives the post that was liked, the user who liked it, and the like's AT URI.
	 */
	override on(
		event: "like",
		listener: (event: { post: Post; user: Profile; uri: string }) => void,
	): this;
	/**
	 * Emitted when the bot is followed.
	 * @param listener A callback function that receives the user who followed the bot and the follow's AT URI.
	 */
	override on(event: "follow", listener: (event: { user: Profile; uri: string }) => void): this;
	/**
	 * @param event The event to listen for.
	 * @param listener The callback function, called when the event is emitted.
	 */
	override on(event: string | symbol, listener: (...args: any[]) => void): this {
		if (!this.eventEmitter) throw new Error("Events are not enabled.");
		if (!this.eventEmitter.emitting) this.eventEmitter.start();
		super.on(event, listener);
		return this;
	}

	override addListener(event: "open", listener: () => void): this;
	override addListener(event: "error", listener: (error: unknown) => void): this;
	override addListener(event: "close", listener: () => void): this;
	override addListener(event: "reply", listener: (post: Post) => void): this;
	override addListener(event: "quote", listener: (post: Post) => void): this;
	override addListener(event: "mention", listener: (post: Post) => void): this;
	override addListener(
		event: "repost",
		listener: (event: { post: Post; user: Profile; uri: string }) => void,
	): this;
	override addListener(
		event: "like",
		listener: (event: { post: Post; user: Profile; uri: string }) => void,
	): this;
	override addListener(
		event: "follow",
		listener: (event: { user: Profile; uri: string }) => void,
	): this;
	/** Alias for {@link Bot#on}. */
	override addListener(event: string | symbol, listener: (...args: any[]) => void): this {
		return this.on(event as never, listener);
	}

	/**
	 * Remove an event listener.
	 * @param event The event to remove the listener for.
	 * @param listener The listener callback to remove.
	 */
	override off(event: string, listener: (...args: any[]) => void): this {
		super.off(event, listener);
		if (!this.listenerCount(event)) this.eventEmitter?.stop();
		return this;
	}

	/** Alias for {@link Bot#off}. */
	override removeListener(event: string, listener: (...args: any[]) => void): this {
		return this.off(event, listener);
	}

	/**
	 * Remove all event listeners, or those of the specified event.
	 * @param event The event to remove listeners for.
	 */
	override removeAllListeners(event?: string): this {
		if (!this.eventEmitter) throw new Error("Events are not enabled.");
		super.removeAllListeners(event);
		this.eventEmitter.stop();
		return this;
	}
}

const NOT_LIMITED_METHODS = ["com.atproto.server.createSession", "com.atproto.server.getSession"];

function rateLimitApi(client: AtpServiceClient, limiter: RateLimitThreshold) {
	const call = client.xrpc.call.bind(client.xrpc);
	client.xrpc.call = async (nsid, ...params) => {
		if (!NOT_LIMITED_METHODS.includes(nsid)) await limiter.limit();
		return call(nsid, ...params);
	};
	return client;
}

/**
 * The bot's cache.
 */
export interface BotCache {
	profiles: QuickLRU<string, Profile>;
	posts: QuickLRU<string, Post>;
	lists: QuickLRU<string, List>;
	feeds: QuickLRU<string, FeedGenerator>;
}

/**
 * Options for the built-in rate limiter.
 */
export interface RateLimitOptions {
	/**
	 * The maximum number of requests that can be made to the Bluesky API in a given interval.
	 * Don't set this unless you know what you're doing.
	 * @default 3000
	 * @see https://www.docs.bsky.app/docs/advanced-guides/rate-limits
	 */
	rateLimit?: number;

	/**
	 * The interval after which the rate limit will reset, in seconds
	 * @default 300
	 * @see https://www.docs.bsky.app/docs/advanced-guides/rate-limits
	 */
	rateLimitInterval?: number;
}

/**
 * Options for the {@link Bot#login} method.
 */
export interface BotLoginOptions {
	/** The bot account's email, handle, or DID. */
	identifier: string;

	/** The bot account's password. */
	password: string;
}

/**
 * A reference to a record.
 */
export interface StrongRef {
	/** The record's AT URI. */
	uri: string;

	/** The record's CID. */
	cid: string;
}

/**
 * Base options for any Bot method that fetches data.
 */
export interface BaseBotGetMethodOptions {
	/**
	 * Whether to skip checking the cache.
	 * @default false
	 */
	skipCache?: boolean;

	/**
	 * Whether to skip caching the response.
	 * @default false
	 */
	noCacheResponse?: boolean;
}

/**
 * Options for the {@link Bot#getPost} method.
 */
export interface BotGetPostOptions extends BaseBotGetMethodOptions {
	/**
	 * How many levels of parent posts to fetch.
	 * @default 1
	 */
	parentHeight?: number;

	/**
	 * How many levels of child posts to fetch.
	 * @default 1
	 */
	depth?: number;
}

/**
 * Options for the {@link Bot#getPosts} method.
 */
export interface BotGetPostsOptions extends BaseBotGetMethodOptions {}

/**
 * Types of posts to be included in the response to {@link Bot#getUserPosts}.
 * @enum
 */
export const GetUserPostsFilter = {
	/** All posts. */
	PostsWithReplies: "posts_with_replies",
	/** Top-level posts only. */
	PostsNoReplies: "posts_no_replies",
	/** Posts with media. */
	PostsWithMedia: "posts_with_media",
	/** Top-level posts and threads where the only author is the user. */
	PostsAndAuthorThreads: "posts_and_author_threads",
} as const;
export type GetUserPostsFilter = typeof GetUserPostsFilter[keyof typeof GetUserPostsFilter];

/**
 * Options for the {@link Bot#getUserPosts} method.
 */
export interface BotGetUserPostsOptions extends Omit<BaseBotGetMethodOptions, "skipCache"> {
	/**
	 * The maximum number of posts to fetch (up to 100, inclusive).
	 * @default 100
	 */
	limit?: number;

	/**
	 * The offset at which to start fetching posts.
	 */
	cursor?: string;

	/**
	 * Post type to include in the response.
	 * @default GetUserPostsFilter.PostsWithReplies
	 */
	filter?: GetUserPostsFilter;
}

/**
 * Options for the {@link Bot#getUserLikes} method.
 */
export interface BotGetUserLikesOptions extends Omit<BaseBotGetMethodOptions, "skipCache"> {
	/**
	 * The maximum number of posts to fetch (up to 100, inclusive).
	 * @default 100
	 */
	limit?: number;

	/**
	 * The offset at which to start fetching posts.
	 */
	cursor?: string;
}

/**
 * Options for the {@link Bot#getProfile} method.
 */
export interface BotGetProfileOptions extends BaseBotGetMethodOptions {}

/**
 * Options for the {@link Bot#getList} method.
 */
export interface BotGetListOptions extends BaseBotGetMethodOptions {}

/**
 * Options for the {@link Bot#getUserLists} method.
 */
export interface BotGetUserListsOptions extends Omit<BaseBotGetMethodOptions, "skipCache"> {
	/**
	 * The maximum number of lists to fetch (up to 100, inclusive).
	 * @default 100
	 */
	limit?: number;

	/**
	 * The offset at which to start fetching lists.
	 */
	cursor?: string;
}

/**
 * Options for the {@link Bot#getFeedGenerator} method.
 */
export interface BotGetFeedGeneratorOptions extends BaseBotGetMethodOptions {}

/**
 * Options for the {@link Bot#getFeedGenerators} method.
 */
export interface BotGetFeedGeneratorsOptions extends BaseBotGetMethodOptions {}

/**
 * Options for the {@link Bot#getTimeline} method.
 */
export interface BotGetTimelineOptions extends BaseBotGetMethodOptions {
	/**
	 * The maximum number of posts to fetch (up to 100, inclusive).
	 * @default 100
	 */
	limit?: number;

	/**
	 * The offset at which to start fetching posts.
	 */
	cursor?: string;
}

/**
 * Options for the {@link Bot#post} method.
 */
export interface BotPostOptions {
	/**
	 * Whether to automatically resolve facets in the post's text.
	 *
	 * This will be ignored if the provided post data already has facets attached.
	 * @default true
	 */
	resolveFacets?: boolean;

	/**
	 * Whether to split the post into multiple posts if it exceeds the character limit.
	 * @default false
	 */
	splitLongPost?: boolean;
}
