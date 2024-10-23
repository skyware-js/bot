import RichText from "@atcute/bluesky-richtext-builder";
import { type AtpSessionData, CredentialManager, type XRPC } from "@atcute/client";
import type {
	AppBskyActorDefs,
	AppBskyEmbedExternal,
	AppBskyEmbedImages,
	AppBskyEmbedRecord,
	AppBskyEmbedRecordWithMedia,
	AppBskyEmbedVideo,
	AppBskyFeedPost,
	AppBskyFeedThreadgate,
	AppBskyRichtextFacet,
	At,
	Brand,
	ComAtprotoLabelDefs,
	ComAtprotoServerCreateSession,
	ComAtprotoServerGetSession,
	Records,
	ToolsOzoneModerationDefs,
	ToolsOzoneModerationEmitEvent,
} from "@atcute/client/lexicons";
import "@atcute/bluesky/lexicons";
import "@atcute/ozone/lexicons";
import { EventEmitter } from "node:events";
import type QuickLRU from "quick-lru";
import { RateLimitThreshold } from "rate-limit-threshold";
import { detectFacetsWithResolution } from "../richtext/detectFacets.js";
import { facetAwareSegment } from "../richtext/facetAwareSegment.js";
import { graphemeLength } from "../richtext/graphemeLength.js";
import { ChatMessage, type ChatMessagePayload } from "../struct/chat/ChatMessage.js";
import { Conversation } from "../struct/chat/Conversation.js";
import { DeletedChatMessage } from "../struct/chat/DeletedChatMessage.js";
import { FeedGenerator } from "../struct/FeedGenerator.js";
import { Labeler } from "../struct/Labeler.js";
import { List } from "../struct/List.js";
import { fetchExternalEmbedData, fetchMediaForBlob } from "../struct/post/embed/util.js";
import { Facet } from "../struct/post/Facet.js";
import { Post } from "../struct/post/Post.js";
import type { PostPayload } from "../struct/post/PostPayload.js";
import { PostReference } from "../struct/post/PostReference.js";
import { type IncomingChatPreference, Profile } from "../struct/Profile.js";
import { StarterPack } from "../struct/StarterPack.js";
import { asDid } from "../util/lexicon.js";
import { parseAtUri } from "../util/parseAtUri.js";
import { BotChatEmitter, type BotChatEmitterOptions } from "./BotChatEmitter.js";
import { BotEventEmitter, type BotEventEmitterOptions, EventStrategy } from "./BotEventEmitter.js";
import { type CacheOptions, makeCache } from "./cache.js";
import { RateLimitedAgent } from "./RateLimitedAgent.js";

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

	/**
	 * Whether to emit chatMessage events (this is independent of {@link emitEvents}).
	 * @default false
	 */
	emitChatEvents?: boolean;

	/** Options for the built-in rate limiter. */
	rateLimitOptions?: RateLimitOptions;

	/** Options for the request cache. */
	cacheOptions?: CacheOptions;

	/** Options for the event emitter. */
	eventEmitterOptions?: BotEventEmitterOptions;

	/** Options for the chat emitter. If this isn't set, the bot will use {@link eventEmitterOptions}. */
	chatEmitterOptions?: BotChatEmitterOptions;
}

/**
 * A bot that can interact with a Bluesky PDS.
 */
export class Bot extends EventEmitter {
	/** The agent used to communicate with a Bluesky PDS. */
	readonly agent: RateLimitedAgent;

	/** The credential manager used to authenticate with a Bluesky PDS. */
	private readonly handler: CredentialManager;

	/** A cache to store API responses. */
	private readonly cache: BotCache;

	/** Receives and emits events. */
	private readonly eventEmitter?: BotEventEmitter;

	/** Receives and emits chat events. */
	private readonly chatEventEmitter?: BotChatEmitter;

	/** The proxy agent for chat-related requests. */
	chatProxy?: XRPC;

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
			emitChatEvents = false,
			rateLimitOptions,
			cacheOptions,
			eventEmitterOptions = { strategy: EventStrategy.Polling },
			chatEmitterOptions,
		}: BotOptions = {},
	) {
		super();

		this.handler = new CredentialManager({ service });
		this.agent = new RateLimitedAgent(
			{ handler: this.handler },
			new RateLimitThreshold(3000, rateLimitOptions?.rateLimitInterval ?? 300),
		);

		this.langs = langs;

		this.cache = {
			profiles: makeCache(cacheOptions),
			posts: makeCache(cacheOptions),
			lists: makeCache({ maxEntries: 100, ...cacheOptions }),
			feeds: makeCache({ maxEntries: 50, ...cacheOptions }),
			labelers: makeCache({ maxEntries: 10, ...cacheOptions }),
			starterPacks: makeCache({ maxEntries: 10, ...cacheOptions }),
			conversations: makeCache({ maxEntries: 50, ...cacheOptions }),
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

		if (emitChatEvents) {
			this.chatEventEmitter = new BotChatEmitter(
				chatEmitterOptions ?? eventEmitterOptions,
				this,
			);
			this.chatEventEmitter.on("message", (event) => this.emit("message", event));
			this.chatEventEmitter.on("error", (error) => this.emit("error", error));
		}
	}

	/** Whether the bot has an active session. */
	get hasSession(): boolean {
		return !!this.handler.session;
	}

	/**
	 * Log in with an identifier and password.
	 * @param options The bot account's identifier and password.
	 * @returns Session data.
	 */
	async login(
		{ identifier, password }: BotLoginOptions,
	): Promise<ComAtprotoServerCreateSession.Output> {
		if (identifier[0] === "@") identifier = identifier.slice(1);

		const response = await this.handler.login({ identifier, password }).catch((e) => {
			throw new Error("Failed to log in — double check your credentials and try again.", {
				cause: e,
			});
		});

		this.chatProxy = this.agent.withProxy("bsky_chat", "did:web:api.bsky.chat");

		this.profile = await this.getProfile(response.did).catch((e) => {
			throw new Error("Failed to fetch bot profile.", { cause: e });
		});

		return response;
	}

	/**
	 * Resume an existing session.
	 * @param session Session data.
	 * @returns Updated session data.
	 */
	async resumeSession(session: AtpSessionData): Promise<ComAtprotoServerGetSession.Output> {
		const response = await this.handler.resume(session).catch((e) => {
			throw new Error("Failed to resume session.", { cause: e });
		});
		this.profile = await this.getProfile(response.did);
		return response;
	}

	/**
	 * Fetch a post by its AT URI.
	 * @param uri The post's AT URI.
	 * @param options Optional configuration.
	 */
	async getPost(uri: string, options: BotGetPostOptions = {}): Promise<Post> {
		options = { parentHeight: 1, depth: 1, ...options };

		if (!options.skipCache && this.cache.posts.has(uri)) return this.cache.posts.get(uri)!;

		const postThread = await this.agent.get("app.bsky.feed.getPostThread", {
			params: { uri, parentHeight: options.parentHeight!, depth: options.depth! },
		}).catch((e) => {
			throw new Error(`Failed to fetch post ${uri}`, { cause: e });
		});

		switch (postThread.data.thread?.$type) {
			case "app.bsky.feed.defs#threadViewPost": {
				const post = Post.fromThreadView(postThread.data.thread, this);
				if (!options.noCacheResponse) this.cache.posts.set(uri, post);
				return post;
			}
			case "app.bsky.feed.defs#blockedPost": {
				throw new Error(`The bot is blocked from viewing post ${uri}.`);
			}
			case "app.bsky.feed.defs#notFoundPost": {
				throw new Error(`The post ${uri} was not found.`);
			}
			default: {
				throw new Error(`An unknown error occurred while trying to fetch post ${uri}.`);
			}
		}
	}

	/**
	 * Fetch up to 25 posts by their AT URIs.
	 * @param uris The URIs of the posts to fetch.
	 * @param options Optional configuration.
	 */
	async getPosts(
		uris: Array<string>,
		options: BaseBotGetMethodOptions = {},
	): Promise<Array<Post>> {
		if (!uris.length) return [];
		if (uris.length > 25) throw new Error("You can only fetch up to 25 posts at a time.");

		if (!options.skipCache && uris.every((uri) => this.cache.posts.has(uri))) {
			return uris.map((uri) => this.cache.posts.get(uri)!);
		}

		const postViews = await this.agent.get("app.bsky.feed.getPosts", { params: { uris } })
			.catch((e) => {
				throw new Error(
					"Failed to fetch posts at URIs:\n- " + uris.slice(0, 3).join("\n- ")
						+ "\n- ...",
					{ cause: e },
				);
			});

		const posts: Array<Post> = [];
		for (const postView of postViews.data.posts) {
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
		const response = await this.agent.get("app.bsky.feed.getAuthorFeed", {
			params: { actor: did, filter: GetUserPostsFilter.PostsWithReplies, ...options },
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
		const response = await this.agent.get("app.bsky.feed.getActorLikes", {
			params: { actor: did, ...options },
		}).catch((e) => {
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
	async getProfile(didOrHandle: string, options: BaseBotGetMethodOptions = {}): Promise<Profile> {
		if (!options.skipCache && this.cache.profiles.has(didOrHandle)) {
			return this.cache.profiles.get(didOrHandle)!;
		}

		const profileView = await this.agent.get("app.bsky.actor.getProfile", {
			params: { actor: didOrHandle },
		}).catch((e) => {
			throw new Error(`Failed to fetch profile ${didOrHandle}.`, { cause: e });
		});

		const profile = Profile.fromView(profileView.data, this);
		if (!options.noCacheResponse) this.cache.profiles.set(didOrHandle, profile);
		return profile;
	}

	/**
	 * Fetch up to 25 (default 25) profiles by their DIDs or handles.
	 * @param identifiers The identifiers of the profiles to fetch.
	 * @param options Optional configuration.
	 */
	async getProfiles(
		identifiers: Array<string>,
		options: BaseBotGetMethodOptions = {},
	): Promise<Array<Profile>> {
		if (!identifiers.length) return [];
		if (identifiers.length > 25) {
			throw new Error("You can only fetch up to 25 profiles at a time.");
		}
		if (
			!options.skipCache
			&& identifiers.every((didOrHandle) => this.cache.profiles.has(didOrHandle))
		) {
			return identifiers.map((didOrHandle) => this.cache.profiles.get(didOrHandle)!);
		}

		const { data } = await this.agent.get("app.bsky.actor.getProfiles", {
			params: { actors: identifiers },
		}).catch((e) => {
			throw new Error(
				"Failed to fetch profiles at identifiers:\n- "
					+ identifiers.slice(0, 3).join("\n- ")
					+ "\n- ...",
				{ cause: e },
			);
		});

		return data.profiles.map((profileView) => {
			const profile = Profile.fromView(profileView, this);
			if (!options.noCacheResponse) this.cache.profiles.set(profile.did, profile);
			return profile;
		});
	}

	/**
	 * Fetch a list by its AT URI.
	 * @param uri The list's AT URI.
	 * @param options Optional configuration.
	 */
	async getList(uri: string, options: BaseBotGetMethodOptions = {}): Promise<List> {
		if (!options.skipCache && this.cache.lists.has(uri)) {
			return this.cache.lists.get(uri)!;
		}

		const response = await this.agent.get("app.bsky.graph.getList", { params: { list: uri } })
			.catch((e) => {
				throw new Error(`Failed to fetch list ${uri}`, { cause: e });
			});

		const list = List.fromView(response.data.list, this);
		list.items = response.data.items.map(({ subject }) => {
			const profile = Profile.fromView(subject, this);
			if (!options.noCacheResponse) this.cache.profiles.set(profile.did, profile);
			return profile;
		});

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
		const response = await this.agent.get("app.bsky.graph.getLists", {
			params: { actor: did, ...options },
		}).catch((e) => {
			throw new Error(`Failed to fetch user lists for ${did}.`, { cause: e });
		});

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
		options: BaseBotGetMethodOptions = {},
	): Promise<FeedGenerator> {
		if (!options.skipCache && this.cache.feeds.has(uri)) {
			return this.cache.feeds.get(uri)!;
		}

		const response = await this.agent.get("app.bsky.feed.getFeedGenerator", {
			params: { feed: uri },
		}).catch((e) => {
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
		options: BaseBotGetMethodOptions = {},
	): Promise<Array<FeedGenerator>> {
		if (!uris.length) return [];

		const feedViews = await this.agent.get("app.bsky.feed.getFeedGenerators", {
			params: { feeds: uris },
		}).catch((e) => {
			throw new Error(
				"Failed to fetch feed generators at URIs:\n- " + uris.slice(0, 3).join("\n- ")
					+ "\n- ...",
				{ cause: e },
			);
		});

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
		const response = await this.agent.get("app.bsky.feed.getTimeline", { params: options })
			.catch((e) => {
				throw new Error("Failed to fetch timeline.", { cause: e });
			});

		return response.data.feed.map((feedViewPost) => {
			const post = Post.fromView(feedViewPost.post, this);
			if (!options.noCacheResponse) this.cache.posts.set(post.uri, post);
			return post;
		});
	}

	/**
	 * Fetch a labeler by its account DID.
	 * @param did The DID of the labeler to fetch.
	 * @param options Optional configuration.
	 */
	async getLabeler(did: string, options: BaseBotGetMethodOptions = {}): Promise<Labeler> {
		if (!options.skipCache && this.cache.labelers.has(did)) {
			return this.cache.labelers.get(did)!;
		}

		const labelers = await this.getLabelers([did]);
		if (!labelers[0]) throw new Error(`Labeler not found for DID ${did}.`);

		if (!options.noCacheResponse) this.cache.labelers.set(labelers[0].uri, labelers[0]);

		return labelers[0];
	}

	/**
	 * 	Fetch a list of labelers by their account DIDs.
	 * 	@param dids The DIDs of the labelers to fetch.
	 * 	@param options Optional configuration.
	 */
	async getLabelers(
		dids: Array<string>,
		options: BaseBotGetMethodOptions = {},
	): Promise<Array<Labeler>> {
		const response = await this.agent.get("app.bsky.labeler.getServices", {
			params: { dids: dids as Array<At.DID>, detailed: true },
		}).catch((e) => {
			throw new Error(
				"Failed to fetch labelers:\n- " + dids.slice(0, 3).join("\n- ") + "\n- ...",
				{ cause: e },
			);
		});

		return response.data.views.map((labelerView) => {
			const labeler = Labeler.fromView(labelerView, this);
			if (!options.noCacheResponse) this.cache.labelers.set(labeler.uri, labeler);
			return labeler;
		});
	}

	/**
	 * Fetch a starter pack by its AT URI.
	 * @param uri The starter pack's AT URI.
	 * @param options Optional configuration.
	 */
	async getStarterPack(uri: string, options: BaseBotGetMethodOptions = {}): Promise<StarterPack> {
		if (!options.skipCache && this.cache.starterPacks.has(uri)) {
			return this.cache.starterPacks.get(uri)!;
		}

		const response = await this.agent.get("app.bsky.graph.getStarterPack", {
			params: { starterPack: uri },
		}).catch((e) => {
			throw new Error(`Failed to fetch starter pack ${uri}`, { cause: e });
		});

		if (!options.noCacheResponse) {
			this.cache.starterPacks.set(uri, StarterPack.fromView(response.data.starterPack, this));
		}

		return StarterPack.fromView(response.data.starterPack, this);
	}

	/**
	 * Fetch a list of starter packs by their AT URIs.
	 * @param uris The URIs of the starter packs to fetch.
	 * @param options Optional configuration.
	 */
	async getStarterPacks(
		uris: Array<string>,
		options: BaseBotGetMethodOptions = {},
	): Promise<Array<StarterPack>> {
		const response = await this.agent.get("app.bsky.graph.getStarterPacks", {
			params: { uris },
		}).catch((e) => {
			throw new Error(
				"Failed to fetch starter packs at URIs:\n- " + uris.slice(0, 3).join("\n- ")
					+ "\n- ...",
				{ cause: e },
			);
		});

		return response.data.starterPacks.map((starterPackView) => {
			const starterPack = StarterPack.fromView(starterPackView, this);
			if (!options.noCacheResponse) this.cache.starterPacks.set(starterPack.uri, starterPack);
			return starterPack;
		});
	}

	/**
	 * Fetch a list of starter packs by their creator's DID.
	 * @param did The creator's DID.
	 * @param options Optional configuration.
	 */
	async getUserStarterPacks(
		did: string,
		options: BotGetUserStarterPacksOptions = {},
	): Promise<Array<StarterPack>> {
		const response = await this.agent.get("app.bsky.graph.getActorStarterPacks", {
			params: { actor: did, limit: options.limit ?? 100, cursor: options.cursor ?? "" },
		}).catch((e) => {
			throw new Error(`Failed to fetch starter packs for creator ${did}.`, { cause: e });
		});

		return response.data.starterPacks.map((starterPackView) => {
			const starterPack = StarterPack.fromView(starterPackView, this);
			if (!options.noCacheResponse) this.cache.starterPacks.set(starterPack.uri, starterPack);
			return starterPack;
		});
	}

	/**
	 * Fetch a conversation containing 1-10 members. If a conversation doesn't exist, it will be created.
	 * @param members The DIDs of the conversation members.
	 * @param options Optional configuration.
	 */
	async getConversationForMembers(
		members: Array<string>,
		options: BaseBotGetMethodOptions = {},
	): Promise<Conversation> {
		if (!this.chatProxy) {
			throw new Error("Chat proxy does not exist. Make sure to log in first.");
		}

		const response = await this.chatProxy.get("chat.bsky.convo.getConvoForMembers", {
			params: { members: members as Array<At.DID> },
		}).catch((e) => {
			throw new Error("Failed to create conversation.", { cause: e });
		});

		const convo = Conversation.fromView(response.data.convo, this);

		if (!options.noCacheResponse) this.cache.conversations.set(convo.id, convo);

		return convo;
	}

	/**
	 * Fetch a conversation by its ID.
	 * @param id The conversation's ID.
	 * @param options Optional configuration.
	 */
	async getConversation(
		id: string,
		options: BaseBotGetMethodOptions = {},
	): Promise<Conversation> {
		if (!options.skipCache && this.cache.conversations.has(id)) {
			return this.cache.conversations.get(id)!;
		}

		if (!this.chatProxy) {
			throw new Error("Chat proxy does not exist. Make sure to log in first.");
		}

		const response = await this.chatProxy.get("chat.bsky.convo.getConvo", {
			params: { convoId: id },
		}).catch((e) => {
			throw new Error(`Failed to fetch conversation ${id}.`, { cause: e });
		});

		const convo = Conversation.fromView(response.data.convo, this);
		if (!options.noCacheResponse) this.cache.conversations.set(convo.id, convo);
		return convo;
	}

	/**
	 * Fetch all conversations the bot is a member of.
	 * @param options Optional configuration.
	 */
	async listConversations(
		options: BotListConversationsOptions = {},
	): Promise<{ cursor: string | undefined; conversations: Array<Conversation> }> {
		options.limit ??= 100;

		if (!this.chatProxy) {
			throw new Error("Chat proxy does not exist. Make sure to log in first.");
		}

		const response = await this.chatProxy.get("chat.bsky.convo.listConvos", { params: options })
			.catch((e) => {
				throw new Error("Failed to list conversations.", { cause: e });
			});

		const conversations = response.data.convos.map((convoView) => {
			const convo = Conversation.fromView(convoView, this);
			if (!options.noCacheResponse) this.cache.conversations.set(convo.id, convo);
			return convo;
		});

		return { cursor: response.data.cursor, conversations };
	}

	/**
	 * Fetch the message history for a conversation.
	 * @param conversationId The ID of the conversation to fetch messages for.
	 * @param options Optional configuration.
	 * @returns An array of messages and a cursor for pagination.
	 */
	async getConversationMessages(
		conversationId: string,
		options: BotGetConversationMessagesOptions = {},
	): Promise<{ cursor: string | undefined; messages: Array<ChatMessage | DeletedChatMessage> }> {
		options.limit ??= 100;

		if (!this.chatProxy) {
			throw new Error("Chat proxy does not exist. Make sure to log in first.");
		}

		const response = await this.chatProxy.get("chat.bsky.convo.getMessages", {
			params: { convoId: conversationId, ...options },
		}).catch((e) => {
			throw new Error(`Failed to fetch messages for conversation ${conversationId}.`, {
				cause: e,
			});
		});

		const messages = response.data.messages.map((view) => {
			if (view.$type === "chat.bsky.convo.defs#messageView") {
				return ChatMessage.fromView(view, this, conversationId);
			}
			if (view.$type === "chat.bsky.convo.defs#deletedMessageView") {
				return DeletedChatMessage.fromView(view, this);
			}
			throw new Error(`Invalid message view: ${JSON.stringify(view)}`);
		});

		return { cursor: response.data.cursor, messages };
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
			facets = await detectFacetsWithResolution(text, this);
		} else {
			text = payload.text;
		}

		// Override facets if provided
		if (payload.facets?.length) {
			for (const facet of payload.facets) {
				if (facet instanceof Facet) facets.push(facet.toRecord());
				else facets.push(facet);
			}
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
			} satisfies Brand.Union<ComAtprotoLabelDefs.SelfLabels>
			: undefined;

		if (payload.images?.length && payload.quoted && !(payload.quoted instanceof Post)) {
			throw new Error("Only a post can be embedded alongside images.");
		}

		if (payload.images?.length && payload.video) {
			throw new Error("A post can only contain one of images or video.");
		}

		const uploadMedia = async (media: string | Blob) => {
			let blob;
			if (typeof media === "string") {
				blob = await fetchMediaForBlob(media, "image/").catch((e) => {
					// eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
					throw new Error(`Failed to fetch media at ${media}.`, { cause: e });
				}) ?? {};
			} else {
				blob = { data: new Uint8Array(await media.arrayBuffer()), type: media.type };
			}

			if (!blob.data?.length) throw new Error("Invalid media data provided.");
			if (!blob.type) throw new Error("Must provide a content type for media data.");

			const uploadedBlob = await this.agent.call("com.atproto.repo.uploadBlob", {
				data: blob.data,
				headers: { "content-type": blob.type },
			}).then((res) => res.data.blob).catch((e) => {
				throw new Error("Failed to upload media.", { cause: e });
			});

			if (!uploadedBlob?.size) throw new Error("Failed to upload media.");
			return uploadedBlob;
		};

		// Upload image blobs
		const images: Array<AppBskyEmbedImages.Image> = [];
		if (payload.images?.length) {
			for (const image of payload.images) {
				if (!image) continue;
				if (image?.data instanceof Blob && !image.data.type.startsWith("image/")) {
					throw new Error("Image blob is not an image");
				}

				image.alt ??= "";

				const imageBlob = await uploadMedia(image.data);

				images.push({ ...image, alt: image.alt, image: imageBlob });
			}
		}

		// Construct the post embed
		let embed: AppBskyFeedPost.Record["embed"] | undefined;

		if (payload.quoted) {
			const record = {
				$type: "app.bsky.embed.record",
				record: { uri: payload.quoted.uri, cid: payload.quoted.cid },
			} satisfies Brand.Union<AppBskyEmbedRecord.Main>;
			embed = images.length
				? {
					$type: "app.bsky.embed.recordWithMedia",
					record,
					media: { $type: "app.bsky.embed.images", images },
				} satisfies Brand.Union<AppBskyEmbedRecordWithMedia.Main>
				: record;
		} else if (payload.external) {
			if (typeof payload.external === "string") {
				const external = await fetchExternalEmbedData.call(this, payload.external).catch(
					(e) => {
						throw new Error("Failed to resolve external embed\n" + e);
					},
				);
				if (external) {
					embed = { $type: "app.bsky.embed.external", external } satisfies Brand.Union<
						AppBskyEmbedExternal.Main
					>;
				}
			} else {
				let thumb: At.Blob | undefined;

				const image = payload.external.thumb?.data;
				if (image) {
					if (image instanceof Blob && !image.type.startsWith("image/")) {
						throw new Error("Image blob is not an image");
					}
					thumb = await uploadMedia(image);
				}

				embed = {
					$type: "app.bsky.embed.external",
					external: {
						title: payload.external.title,
						uri: payload.external.uri,
						description: payload.external.description,
						...(thumb ? { thumb } : {}),
					},
				} satisfies Brand.Union<AppBskyEmbedExternal.Main>;
			}
		} else if (images.length) {
			embed = { $type: "app.bsky.embed.images", images } satisfies Brand.Union<
				AppBskyEmbedImages.Main
			>;
		} else if (payload.video) {
			if (
				payload.video?.data instanceof Blob && !payload.video.data.type.startsWith("video/")
			) {
				throw new Error("Video blob is not a video");
			}

			payload.video.alt ??= "";

			const videoBlob = await uploadMedia(payload.video.data);

			embed = {
				...payload.video,
				$type: "app.bsky.embed.video",
				video: videoBlob,
			} satisfies Brand.Union<AppBskyEmbedVideo.Main>;
		}

		const postRecord: AppBskyFeedPost.Record = {
			$type: "app.bsky.feed.post",
			text,
			facets,
			createdAt: payload.createdAt.toISOString(),
			langs: payload.langs,
		};
		// @ts-expect-error — AppBskyFeedPost.ReplyRef has a string index signature
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
			const rkey = postUri.split("/").pop()!;
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

		return this.createRecord("app.bsky.feed.like", { subject: { uri, cid } }).catch((e) => {
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

		return this.createRecord("app.bsky.feed.repost", { subject: { uri, cid } }).catch((e) => {
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

		return this.createRecord("app.bsky.graph.follow", { subject: asDid(did) }).catch((e) => {
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
		await this.agent.call("app.bsky.graph.muteActor", { data: { actor: did } }).catch((e) => {
			throw new Error(`Failed to mute user ${did}.`, { cause: e });
		});
	}

	/**
	 * Delete a mute.
	 * @param did The user's DID.
	 */
	async unmute(did: string): Promise<void> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);
		await this.agent.call("app.bsky.graph.unmuteActor", { data: { actor: did } }).catch((e) => {
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
		return this.createRecord("app.bsky.graph.block", { subject: asDid(did) }).catch((e) => {
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
	 * Send a message in a DM conversation.
	 * @param payload The message payload.
	 * @param options Optional configuration.
	 * @returns The sent message.
	 */
	async sendMessage(
		payload: ChatMessagePayload,
		options: BotSendMessageOptions = {},
	): Promise<ChatMessage> {
		options.resolveFacets ??= true;

		if (!this.chatProxy) {
			throw new Error("Chat proxy does not exist. Make sure to log in first.");
		}

		let text: string, facets: Array<AppBskyRichtextFacet.Main> = [];
		if (payload.text instanceof RichText) {
			({ text, facets } = payload.text.build());
		} else if (options.resolveFacets) {
			text = payload.text;
			facets = await detectFacetsWithResolution(text, this);
		} else {
			text = payload.text;
		}

		if (graphemeLength(text) > 1000) {
			throw new Error("Message exceeds maximum length of 1000 graphemes.");
		}

		const response = await this.chatProxy.call("chat.bsky.convo.sendMessage", {
			data: {
				convoId: payload.conversationId,
				message: {
					text,
					facets,
					...(payload.embed
						? { embed: { $type: "app.bsky.embed.record", record: payload.embed } }
						: {}),
				},
			},
		}).catch((e) => {
			throw new Error("Failed to send message.", { cause: e });
		});

		return ChatMessage.fromView(response.data, this, payload.conversationId);
	}

	/**
	 * Send up to 100 private messages at once.
	 * @param payload The messages payload.
	 * @param options Optional configuration.
	 * @returns The sent messages.
	 */
	async sendMessages(
		payload: Array<ChatMessagePayload>,
		options: BotSendMessageOptions = {},
	): Promise<Array<ChatMessage>> {
		options.resolveFacets ??= true;

		if (!this.chatProxy) {
			throw new Error("Chat proxy does not exist. Make sure to log in first.");
		}

		const messages = await Promise.all(payload.map(async (message) => {
			let text: string, facets: Array<AppBskyRichtextFacet.Main> = [];
			if (message.text instanceof RichText) {
				({ text, facets } = message.text.build());
			} else if (options.resolveFacets) {
				text = message.text;
				facets = await detectFacetsWithResolution(text, this);
			} else {
				text = message.text;
			}

			if (graphemeLength(text) > 1000) {
				throw new Error("Message exceeds maximum length of 1000 graphemes.");
			}

			return {
				convoId: message.conversationId,
				message: {
					text,
					facets,
					...(message.embed
						? {
							embed: {
								$type: "app.bsky.embed.record" as const,
								record: message.embed,
							},
						}
						: {}),
				},
			};
		}));

		const response = await this.chatProxy.call("chat.bsky.convo.sendMessageBatch", {
			data: { items: messages },
		}).catch((e) => {
			throw new Error("Failed to send messages.", { cause: e });
		});

		return response.data.items.map((view) =>
			ChatMessage.fromView(view, this, messages[0].convoId)
		);
	}

	/**
	 * Leave a DM conversation.
	 * @param id The conversation's ID.
	 */
	async leaveConversation(id: string): Promise<void> {
		if (!this.chatProxy) {
			throw new Error("Chat proxy does not exist. Make sure to log in first.");
		}

		await this.chatProxy.call("chat.bsky.convo.leaveConvo", { data: { convoId: id } }).catch(
			(e) => {
				throw new Error(`Failed to leave conversation ${id}.`, { cause: e });
			},
		);
	}

	/**
	 * Label a user or record. Note that you need a running labeler server on this DID to publish labels!
	 * @param options Information on the label to apply.
	 * @see [@skyware/labeler | Getting Started](https://skyware.js.org/guides/labeler/introduction/getting-started/) to run a minimal labeler server.
	 * @see [Self-hosting Ozone](https://github.com/bluesky-social/ozone/blob/main/HOSTING.md) for a full web UI and report handling.
	 */
	async label(
		{ reference, labels, blobCids = [], comment }: BotLabelRecordOptions,
	): Promise<ToolsOzoneModerationDefs.ModEventView> {
		return this.emitLabelEvent(reference, {
			createLabelVals: labels,
			negateLabelVals: [],
			...(comment ? { comment } : {}),
		}, blobCids).catch((e) => {
			throw new Error(
				`Failed to label record ${"did" in reference ? reference.did : reference.uri}.`,
				{ cause: e },
			);
		});
	}

	/**
	 * Negate labels previously applied to a record by the bot.
	 * @param options Information on the record to negate labels on.
	 */
	async negateLabels(
		{ reference, labels, blobCids = [], comment }: BotLabelRecordOptions,
	): Promise<ToolsOzoneModerationDefs.ModEventView> {
		return this.emitLabelEvent(reference, {
			createLabelVals: [],
			negateLabelVals: labels,
			...(comment ? { comment } : {}),
		}, blobCids).catch((e) => {
			throw new Error(
				`Failed to negate label on record ${
					"did" in reference ? reference.did : reference.uri
				}.`,
				{ cause: e },
			);
		});
	}

	private async emitLabelEvent(
		reference: RepoRef | StrongRef,
		event: ToolsOzoneModerationDefs.ModEventLabel,
		subjectBlobCids: Array<string>,
	): Promise<ToolsOzoneModerationDefs.ModEventView> {
		if (!this.profile.isLabeler) {
			throw new Error(
				"The bot doesn't seem to have a labeler service declared.\nFor more information, see https://skyware.js.org/guides/labeler/introduction/getting-started/",
			);
		}
		const subject: ToolsOzoneModerationEmitEvent.Input["subject"] = "did" in reference
			? { $type: "com.atproto.admin.defs#repoRef", did: asDid(reference.did) }
			: { $type: "com.atproto.repo.strongRef", uri: reference.uri, cid: reference.cid };
		return this.agent.withProxy("atproto_labeler", this.profile.did).call(
			"tools.ozone.moderation.emitEvent",
			{
				data: {
					event: {
						$type: "tools.ozone.moderation.defs#modEventLabel" as const,
						...event,
					} satisfies Brand.Union<ToolsOzoneModerationDefs.ModEventLabel>,
					subject,
					createdBy: this.profile.did,
					subjectBlobCids,
				},
			},
		).then((res) => res.data).catch((e) => {
			throw new Error("Failed to emit label event.", { cause: e });
		});
	}

	/**
	 * Subscribe to a labeler while this Bot instance exists.
	 * @param did The labeler's DID.
	 */
	addLabeler(did: string): void {
		this.agent.labelers.add(did);
	}

	/**
	 * Unsubscribe the current Bot instance from a labeler.
	 * @param did The labeler's DID.
	 */
	removeLabeler(did: string): void {
		this.agent.labelers.delete(did);
	}

	/**
	 * Resolve a handle to a DID.
	 * @param handle The handle to resolve.
	 * @returns The user's DID.
	 */
	async resolveHandle(handle: string): Promise<string> {
		const response = await this.agent.get("com.atproto.identity.resolveHandle", {
			params: { handle },
		}).catch((e) => {
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
		await this.agent.call("com.atproto.identity.updateHandle", { data: { handle } }).catch(
			(e) => {
				throw new Error("Failed to update handle.", { cause: e });
			},
		);
		this.profile.handle = handle;
	}

	/**
	 * Set the bot's preference for who can initiate a new chat conversation. This does not affect existing conversations.
	 * @param preference The new preference.
	 */
	async setChatPreference(preference: IncomingChatPreference): Promise<void> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);
		await this.putRecord("chat.bsky.actor.declaration", { allowIncoming: preference }, "self");
	}

	/**
	 * Create a record.
	 * @param nsid The collection's NSID.
	 * @param record The record to create.
	 * @param rkey The rkey to use.
	 * @returns The record's AT URI and CID.
	 */
	async createRecord<NSID extends keyof Records>(
		nsid: NSID,
		record: Omit<Records[NSID], "$type" | "createdAt">,
		rkey?: string,
	): Promise<StrongRef> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);
		const response = await this.agent.call("com.atproto.repo.createRecord", {
			data: {
				collection: nsid,
				record: { $type: nsid, createdAt: new Date().toISOString(), ...record },
				repo: this.profile.did,
				...(rkey ? { rkey } : {}),
			},
		});
		return response.data;
	}

	/**
	 * Put a record in place of an existing record.
	 * @param nsid The collection's NSID.
	 * @param record The record to put.
	 * @param rkey The rkey to use.
	 * @returns The record's AT URI and CID.
	 */
	async putRecord(nsid: string, record: object, rkey: string): Promise<StrongRef> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);
		const response = await this.agent.call("com.atproto.repo.putRecord", {
			data: {
				collection: nsid,
				record: { $type: nsid, createdAt: new Date().toISOString(), ...record },
				repo: this.profile.did,
				rkey,
			},
		});
		return response.data;
	}

	/**
	 * Delete a record.
	 * @param uri The record's AT URI.
	 */
	async deleteRecord(uri: string): Promise<void> {
		const { host: repo, collection, rkey } = parseAtUri(uri);
		if (repo !== this.profile.did) throw new Error("Can only delete own record.");
		await this.agent.call("com.atproto.repo.deleteRecord", {
			data: { collection, repo, rkey },
		});
	}

	/**
	 * Update private user preferences for the bot account.
	 * @param callback A callback function that receives the current preferences and returns the updated preferences.
	 * @returns The updated preferences.
	 */
	async updatePreferences(
		callback: (preferences: AppBskyActorDefs.Preferences) => AppBskyActorDefs.Preferences,
	): Promise<AppBskyActorDefs.Preferences> {
		if (!this.hasSession) throw new Error(NO_SESSION_ERROR);
		const currentPrefs = await this.agent.get("app.bsky.actor.getPreferences", {});
		const updatedPrefs = callback(currentPrefs.data.preferences);
		return this.agent.call("app.bsky.actor.putPreferences", {
			data: { preferences: updatedPrefs },
		}).then((r) => r.data);
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
	 * @param listener A callback function that receives the subject that was liked, the user who liked it, and the like's AT URI.
	 */
	override on(
		event: "like",
		listener: (
			event: { subject: Post | FeedGenerator | Labeler; user: Profile; uri: string },
		) => void,
	): this;
	/**
	 * Emitted when the bot is followed.
	 * @param listener A callback function that receives the user who followed the bot and the follow's AT URI.
	 */
	override on(event: "follow", listener: (event: { user: Profile; uri: string }) => void): this;
	/**
	 * Emitted when the bot receives a message in a DM conversation.
	 * @param listener A callback function that receives the message.
	 */
	override on(event: "message", listener: (message: ChatMessage) => void): this;
	/**
	 * @param event The event to listen for.
	 * @param listener The callback function, called when the event is emitted.
	 */
	override on(event: string | symbol, listener: (...args: any[]) => void): this {
		if (!this.eventEmitter && !this.chatEventEmitter) {
			throw new Error("Events are not enabled.");
		}
		// TODO: find a better solution for this
		if (event === "message" && !this.chatEventEmitter?.emitting) this.chatEventEmitter?.start();
		else if (!this.eventEmitter?.emitting) this.eventEmitter?.start();
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
	override addListener(event: "message", listener: (message: ChatMessage) => void): this;
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
		if (!this.eventEmitter && !this.chatEventEmitter) {
			throw new Error("Events are not enabled.");
		}
		super.removeAllListeners(event);
		this.eventEmitter?.stop();
		this.chatEventEmitter?.stop();
		return this;
	}
}

/**
 * The bot's cache.
 */
export interface BotCache {
	profiles: QuickLRU<string, Profile>;
	posts: QuickLRU<string, Post>;
	lists: QuickLRU<string, List>;
	feeds: QuickLRU<string, FeedGenerator>;
	labelers: QuickLRU<string, Labeler>;
	starterPacks: QuickLRU<string, StarterPack>;
	conversations: QuickLRU<string, Conversation>;
}

/**
 * Options for the built-in rate limiter.
 */
export interface RateLimitOptions {
	/**
	 * The maximum number of requests that can be made to a Bluesky PDS in a given interval.
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
 * A reference to a user repository.
 */
export interface RepoRef {
	/** The user's DID. */
	did: string;
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
 * Options for the {@link Bot#getUserStarterPacks} method.
 */
export interface BotGetUserStarterPacksOptions extends Omit<BaseBotGetMethodOptions, "skipCache"> {
	/**
	 * The maximum number of starter packs to fetch (up to 100, inclusive).
	 * @default 100
	 */
	limit?: number;

	/**
	 * The offset at which to start fetching starter packs.
	 */
	cursor?: string;
}

/**
 * Options for the {@link Bot#listConversations} method.
 */
export interface BotListConversationsOptions extends BaseBotGetMethodOptions {
	/**
	 * The maximum number of conversations to fetch (up to 100, inclusive).
	 * @default 100
	 */
	limit?: number;

	/**
	 * The offset at which to start fetching conversations.
	 */
	cursor?: string;
}

/**
 * Options for the {@link Bot#getConversationMessages} method.
 */
export interface BotGetConversationMessagesOptions {
	/**
	 * The maximum number of messages to fetch (up to 100, inclusive).
	 * @default 100
	 */
	limit?: number;

	/**
	 * The offset at which to start fetching messages.
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

/**
 * Options for the {@link Bot#sendMessage} method.
 */
export interface BotSendMessageOptions {
	/**
	 * Whether to automatically resolve facets in the message's text.
	 *
	 * This will be ignored if the provided message data already has facets attached.
	 * @default true
	 */
	resolveFacets?: boolean;
}

export interface BotLabelRecordOptions {
	/**
	 * A reference to the record to label.
	 */
	reference: RepoRef | StrongRef;

	/**
	 * The labels to apply.
	 */
	labels: Array<string>;

	/**
	 * The CIDs of specific blobs within the record that the labels apply to, if any.
	 */
	blobCids?: Array<string> | undefined;

	/**
	 * An optional comment.
	 */
	comment?: string | undefined;
}
