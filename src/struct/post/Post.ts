import type { AppBskyFeedDefs, At, Brand, ComAtprotoLabelDefs } from "@atcute/client/lexicons";
import type { Bot, BotGetPostOptions } from "../../bot/Bot.js";
import { is } from "../../util/lexicon.js";
import { Profile } from "../Profile.js";
import type { PostEmbed } from "./embed/PostEmbed.js";
import { isEmbedMainRecord, isEmbedView, postEmbedFromView } from "./embed/util.js";
import { Facet } from "./Facet.js";
import { PostReference, type PostReferenceData } from "./PostReference.js";
import { Threadgate } from "./Threadgate.js";
import { makeIterableWithCursorParameter } from "../../util/makeIterable.js";

/**
 * Data used to construct a Post class.
 * @see Post
 */
export interface PostData extends PostReferenceData {
	text: string;
	author: Profile;
	facets?: Array<Facet> | undefined;
	langs?: Array<string> | undefined;
	embed?: PostEmbed | undefined;
	labels?: Array<ComAtprotoLabelDefs.Label> | undefined;
	tags?: Array<string> | undefined;
	threadgate?: Threadgate | undefined;
	embeddingDisabled?: boolean | undefined;
	root?: Post | undefined;
	parent?: Post | undefined;
	children?: Array<Post> | undefined;
	createdAt?: Date | undefined;
	indexedAt?: Date | undefined;
	likeUri?: string | undefined;
	repostUri?: string | undefined;
	likeCount?: number | undefined;
	repostCount?: number | undefined;
	replyCount?: number | undefined;
	quoteCount?: number | undefined;
}

/**
 * Represents a post on Bluesky.
 */
export class Post extends PostReference {
	/** The post text. */
	text: string;

	/** The post's author. */
	author: Profile;

	/**
	 * A facet represents a range within the post's text that has special meaning (e.g. mentions, links, tags).
	 * @see [Links, mentions, and rich text | Bluesky](https://www.docs.bsky.app/docs/advanced-guides/post-richtext#rich-text-facets)
	 */
	facets?: Array<Facet>;

	/** A list of two-letter language codes that the post is written in. */
	langs?: Array<string>;

	/** The embed attached to the post, if there is any. */
	embed?: PostEmbed;

	/** The labels attached to the post, if there are any. */
	labels?: Array<ComAtprotoLabelDefs.Label>;

	/** Additional non-inline tags attached to the post. */
	tags?: Array<string>;

	/** The threadgate attached to the post, if there is any. */
	threadgate?: Threadgate;

	/** Whether embedding this post is disallowed by a postgate. */
	embeddingDisabled?: boolean;

	/** The root post of this post's thread. */
	root?: Post;

	/** The post's parent. */
	parent?: Post;

	/** The post's children. */
	children?: Array<Post>;

	/** The time the post was created. */
	createdAt: Date;

	/** The time the post was indexed by the AppView. */
	indexedAt?: Date;

	/** The post's like URI, if the bot has liked the post. */
	likeUri?: At.Uri;

	/** The post's repost URI, if the bot has reposted the post. */
	repostUri?: At.Uri;

	/** The post's like count. */
	likeCount?: number;

	/** The post's repost count. */
	repostCount?: number;

	/** The post's reply count. */
	replyCount?: number;

	/** The post's quote count. */
	quoteCount?: number;

	/**
	 * @param data Post data.
	 * @param bot The active Bot instance.
	 */
	constructor(
		// dprint-ignore
		{ text, uri, cid, author, facets, replyRef, langs, embed, labels, tags, likeUri, repostUri, likeCount, replyCount, repostCount, quoteCount, threadgate, embeddingDisabled, createdAt = new Date(), indexedAt, parent, root, children, }: PostData,
		bot: Bot,
	) {
		super({ uri, cid, replyRef }, bot);

		this.text = text;
		this.author = author;
		if (facets) this.facets = facets;
		if (langs) this.langs = langs;
		if (embed) this.embed = embed;
		if (labels) this.labels = labels;
		if (tags) this.tags = tags;

		if (likeUri) this.likeUri = likeUri;
		if (repostUri) this.repostUri = repostUri;

		if (likeCount) this.likeCount = likeCount;
		if (replyCount) this.replyCount = replyCount;
		if (repostCount) this.repostCount = repostCount;
		if (quoteCount) this.quoteCount = quoteCount;

		if (threadgate) this.threadgate = threadgate;
		if (embeddingDisabled !== undefined) this.embeddingDisabled = embeddingDisabled;

		this.createdAt = createdAt;
		if (indexedAt) this.indexedAt = indexedAt;

		if (parent) this.parent = parent;
		if (root) this.root = root;
		if (children) this.children = children;
	}

	private async fetchThreadView(): Promise<AppBskyFeedDefs.ThreadViewPost> {
		const response = await this.bot.agent.get("app.bsky.feed.getPostThread", {
			params: { uri: this.uri },
		}).catch((e) => {
			throw new Error("Failed to fetch post like count", { cause: e });
		});
		if (response.data.thread.$type !== "app.bsky.feed.defs#threadViewPost") {
			throw new Error(
				`Could not fetch post ${this.uri}. ` + response.data.thread.$type
						=== "app.bsky.feed.defs#blockedPost"
					? "User is blocked from viewing this post."
					: "The post could not be found.",
			);
		}
		return response.data.thread;
	}

	/**
	 * Refetch the post.
	 * @param options Optional configuration.
	 */
	override async fetch(options: BotGetPostOptions = {}) {
		return Object.assign(
			this,
			await this.bot.getPost(this.uri, { skipCache: true, ...options }),
		);
	}

	/**
	 * Fetch the root post of the thread.
	 * @param options Optional configuration.
	 */
	async fetchRoot({ force = false }: PostFetchRootOptions = {}): Promise<Post | null> {
		if (this.root && !force) return this.root;
		if (!this.replyRef?.root?.uri) return null;
		return this.root = await this.bot.getPost(this.replyRef.root.uri, { skipCache: force });
	}

	/**
	 * Fetch the parent post.
	 * @param options Optional configuration.
	 */
	async fetchParent(
		{ parentHeight = 1, force = false }: PostFetchParentOptions = {},
	): Promise<Post | null> {
		if (this.parent && !force) return this.parent;
		if (!this.replyRef?.parent?.uri) return null;
		return this.parent = await this.bot.getPost(this.replyRef.parent.uri, {
			parentHeight,
			skipCache: force,
		});
	}

	/**
	 * Fetch the children of the post.
	 * @param options Optional configuration.
	 */
	async fetchChildren(
		{ depth = 1, force = false }: PostFetchChildrenOptions = {},
	): Promise<Array<Post>> {
		if (this.children && !force) return this.children;
		const threadView = await this.bot.getPost(this.uri, { depth, skipCache: force });
		return this.children = threadView.children ?? [];
	}

	private setCounts(view: AppBskyFeedDefs.PostView) {
		if (view.likeCount != undefined) this.likeCount = view.likeCount;
		if (view.repostCount != undefined) this.repostCount = view.repostCount;
		if (view.replyCount != undefined) this.replyCount = view.replyCount;
		if (view.quoteCount != undefined) this.quoteCount = view.quoteCount;
	}

	/**
	 * Fetch the post's current like count.
	 */
	async getLikeCount(): Promise<number | null> {
		const thread = await this.fetchThreadView();
		this.setCounts(thread.post);
		const { likeCount } = thread.post;
		return likeCount ?? null;
	}

	/**
	 * Fetch the post's current repost count.
	 */
	async getRepostCount(): Promise<number | null> {
		const thread = await this.fetchThreadView();
		this.setCounts(thread.post);
		const { repostCount } = thread.post;
		return repostCount ?? null;
	}

	/**
	 * Fetch the post's current reply count.
	 */
	async getReplyCount(): Promise<number | null> {
		const thread = await this.fetchThreadView();
		this.setCounts(thread.post);
		const { replyCount } = thread.post;
		return replyCount ?? null;
	}

	/**
	 * Fetch the post's current quote count.
	 */
	async getQuoteCount(): Promise<number | null> {
		const thread = await this.fetchThreadView();
		this.setCounts(thread.post);
		const { quoteCount } = thread.post;
		return quoteCount ?? null;
	}

	/**
	 * Fetch a list of users who liked this post.
	 * This method returns 100 likes at a time, alongside a cursor to fetch the next 100.
	 * @param cursor The cursor to begin fetching from.
	 */
	async getLikes(
		cursor?: string,
	): Promise<{ cursor?: string; likes: Array<Profile> }> {
		const response = await this.bot.agent.get("app.bsky.feed.getLikes", {
			params: { uri: this.uri, limit: 100, cursor: cursor ?? "" },
		}).catch((e) => {
			throw new Error("Failed to fetch likes.", { cause: e });
		});
		return {
			likes: response.data.likes.map((like) => Profile.fromView(like.actor, this.bot)),
			...(response.data.cursor ? { cursor: response.data.cursor } : {}),
		};
	}

	/**
	 * Iterate over the users who liked this post.
	 * @param cursor The cursor to begin fetching from.
	 */
	iterateLikes(cursor?: string): AsyncIterableIterator<Profile> {
		return makeIterableWithCursorParameter(this.getLikes.bind(this))(cursor);
	}

	/**
	 * Fetch a list of users who reposted this post.
	 * This method returns 100 users at a time, alongside a cursor to fetch the next 100.
	 * @param cursor The cursor to begin fetching from.
	 */
	async getReposts(
		cursor?: string,
	): Promise<{ cursor?: string; reposts: Array<Profile> }> {
		const response = await this.bot.agent.get("app.bsky.feed.getRepostedBy", {
			params: { uri: this.uri, limit: 100, cursor: cursor ?? "" },
		}).catch((e: unknown) => {
			throw new Error("Failed to fetch reposts.", { cause: e });
		});
		return {
			reposts: response.data.repostedBy.map((actor) => Profile.fromView(actor, this.bot)),
			...(response.data.cursor ? { cursor: response.data.cursor } : {}),
		};
	}

	/**
	 * Iterate over the users who reposted this post.
	 * @param cursor The cursor to begin fetching from.
	 */
	iterateReposts(cursor?: string): AsyncIterableIterator<Profile> {
		return makeIterableWithCursorParameter(this.getReposts.bind(this))(cursor);
	}

	/**
	 * Fetch a list of posts that quote this post.
	 * This method returns 100 quotes at a time, alongside a cursor to fetch the next 100.
	 * @param cursor The cursor to begin fetching from.
	 */
	async getQuotes(cursor?: string): Promise<{ cursor?: string; quotes: Array<Post> }> {
		const response = await this.bot.agent.get("app.bsky.feed.getQuotes", {
			params: { uri: this.uri, limit: 100, cursor: cursor ?? "" },
		}).catch((e: unknown) => {
			throw new Error("Failed to fetch quotes.", { cause: e });
		});
		return {
			quotes: response.data.posts.map((quote) => Post.fromView(quote, this.bot)),
			...(response.data.cursor ? { cursor: response.data.cursor } : {}),
		};
	}

	/**
	 * Iterate over the posts that quote this post.
	 * @param cursor The cursor to begin fetching from.
	 */
	iterateQuotes(cursor?: string): AsyncIterableIterator<Post> {
		return makeIterableWithCursorParameter(this.getQuotes.bind(this))(cursor);
	}

	/**
	 * Constructs an instance from a PostView.
	 */
	static fromView(view: Brand.Omit<AppBskyFeedDefs.PostView>, bot: Bot): Post {
		if (!is("app.bsky.feed.post", view.record)) throw new Error("Invalid post view record");
		const text = view.record.text;
		const post = new Post({
			text,
			uri: view.uri,
			cid: view.cid,
			author: Profile.fromView(view.author, bot),
			facets: view.record.facets?.map((facet) => new Facet(text, facet)),
			replyRef: view.record.reply,
			langs: view.record.langs,
			embed: view.embed && isEmbedView(view.embed) && isEmbedMainRecord(view.record.embed)
				? postEmbedFromView({ view: view.embed, record: view.record.embed, bot })
				: undefined,
			labels: view.labels,
			tags: view.record.tags,
			likeUri: view.viewer?.like,
			repostUri: view.viewer?.repost,
			likeCount: view.likeCount,
			repostCount: view.repostCount,
			replyCount: view.replyCount,
			threadgate: undefined,
			embeddingDisabled: view.viewer?.embeddingDisabled,
			createdAt: new Date(view.record.createdAt),
			indexedAt: view.indexedAt ? new Date(view.indexedAt) : undefined,
		}, bot);
		if (view.threadgate) {
			post.threadgate = Threadgate.fromView(view.threadgate, post, bot);
		}
		return post;
	}

	/**
	 * Constructs an instance from a ThreadViewPost.
	 */
	static fromThreadView(view: AppBskyFeedDefs.ThreadViewPost, bot: Bot): Post {
		if (!is("app.bsky.feed.post", view.post.record)) {
			throw new Error("Invalid post view record");
		}

		const parent = view.parent?.$type === "app.bsky.feed.defs#threadViewPost"
			? Post.fromThreadView(view.parent, bot)
			: undefined;
		const children = view.replies?.map((reply) =>
			reply.$type === "app.bsky.feed.defs#threadViewPost"
				? Post.fromThreadView(reply, bot)
				: undefined
		)?.filter((reply): reply is Post => reply !== undefined);

		return new Post({ ...Post.fromView(view.post, bot), parent, children }, bot);
	}
}

/**
 * Options for the {@link Post#fetchRoot} method.
 */
export interface PostFetchRootOptions {
	/** Whether to fetch the root post even if it's already cached. */
	force?: boolean;
}

/**
 * Options for the {@link Post#fetchParent} method.
 */
export interface PostFetchParentOptions {
	/** How many levels up to fetch. */
	parentHeight?: number;
	/** Whether to fetch the parent post even if it's already cached. */
	force?: boolean;
}

/**
 * Options for the {@link Post#fetchChildren} method.
 */
export interface PostFetchChildrenOptions {
	/** How many levels of replies to fetch. */
	depth?: number;
	/** Whether to fetch children even if they're already cached. */
	force?: boolean;
}
