import {
	AppBskyFeedDefs,
	AppBskyFeedPost,
	AppBskyRichtextFacet,
	ComAtprotoLabelDefs,
} from "@atproto/api";
import { Bot, BotPostOptions } from "../../bot/Bot";
import { Profile } from "../Profile";
import { PostEmbed } from "./embed/PostEmbed";
import { isEmbedMainRecord, isEmbedView, postEmbedFromView } from "./embed/util";
import { PostPayload } from "./PostPayload";
import { Threadgate } from "./Threadgate";

/**
 * Data that can be used to construct a Post class
 */
export interface PostData {
	text: string;
	uri: string;
	cid: string;
	author: Profile;
	facets?: Array<AppBskyRichtextFacet.Main> | undefined;
	replyRef?: AppBskyFeedPost.ReplyRef | undefined;
	langs?: Array<string> | undefined;
	embed?: PostEmbed | undefined;
	labels?: Array<ComAtprotoLabelDefs.Label> | undefined;
	tags?: Array<string> | undefined;
	likeCount?: number | undefined;
	repostCount?: number | undefined;
	replyCount?: number | undefined;
	threadgate?: Threadgate | undefined;
	createdAt?: Date | undefined;
	indexedAt?: Date | undefined;
	parent?: Post | undefined;
	root?: Post | undefined;
	children?: Array<Post> | undefined;
}

/**
 * Represents a post on Bluesky
 */
export class Post {
	/**  The text of the post */
	text: string;

	/** The post's AT URI */
	uri: string;

	/** The post's CID */
	cid: string;

	/** The post's author */
	author: Profile;

	/**
	 * A facet represents a range within the post's text that has special meaning
	 * (e.g. mentions, links, tags)
	 * @see https://www.docs.bsky.app/docs/advanced-guides/post-richtext#rich-text-facets
	 */
	facets?: Array<AppBskyRichtextFacet.Main>;

	/** A reference to the post's parent and root post */
	replyRef?: AppBskyFeedPost.ReplyRef;

	/** A list of two-letter language codes that the post is written in */
	langs?: Array<string>;

	/** The embed attached to the post, if there is any */
	embed?: PostEmbed;

	/** The labels attached to the post, if there are any */
	labels?: Array<ComAtprotoLabelDefs.Label>;

	/** Additional non-inline tags attached to the post */
	tags?: Array<string>;

	/** The post's like count */
	likeCount?: number;

	/** The post's repost count */
	repostCount?: number;

	/** The post's reply count */
	replyCount?: number;

	/** The threadgate attached to the post, if there is any */
	threadgate?: Threadgate;

	/** The time the post was created */
	createdAt: Date;

	/** The time the post was indexed by the App View */
	indexedAt?: Date;

	/** The root post of this post's thread */
	private _root?: Post;

	/** The post's parent */
	private _parent?: Post;

	/** The post's children */
	private _children?: Array<Post>;

	constructor(
		// dprint-ignore
		{ text, uri, cid, author, facets, replyRef, langs, embed, labels, tags, likeCount, replyCount, repostCount, threadgate, createdAt = new Date(), indexedAt, parent, root, children, }: PostData,
		/** The active Bot instance */
		public bot: Bot,
	) {
		this.text = text;
		this.uri = uri;
		this.cid = cid;
		this.author = author;
		if (facets) this.facets = facets;
		if (replyRef) this.replyRef = replyRef;
		if (langs) this.langs = langs;
		if (embed) this.embed = embed;
		if (labels) this.labels = labels;
		if (tags) this.tags = tags;
		if (likeCount) this.likeCount = likeCount;
		if (replyCount) this.replyCount = replyCount;
		if (repostCount) this.repostCount = repostCount;
		if (threadgate) this.threadgate = threadgate;

		this.createdAt = createdAt;
		if (indexedAt) this.indexedAt = indexedAt;

		if (parent) this._parent = parent;
		if (root) this._root = root;
		if (children) this._children = children;
	}

	/**
	 * Fetch the root post of the thread
	 */
	async fetchRoot(): Promise<Post | null> {
		if (this._root) return this._root;
		if (!this.replyRef?.root?.uri) return null;
		return this._root = await this.bot.getPost(this.replyRef.root.uri);
	}

	/**
	 * Fetch the parent post
	 * @param parentHeight How many levels up to fetch
	 */
	async fetchParent(parentHeight = 1): Promise<Post | null> {
		if (this._parent) return this._parent;
		if (!this.replyRef?.parent?.uri) return null;
		return this._parent = await this.bot.getPost(this.replyRef.parent.uri, { parentHeight });
	}

	/**
	 * Fetch the children of the post
	 * @param depth How many levels of replies to fetch
	 */
	async fetchChildren(depth = 1): Promise<Array<Post>> {
		if (this._children) return this._children;
		const threadView = await this.bot.getPost(this.uri, { depth });
		return this._children = threadView._children ?? [];
	}

	private setCounts(view: AppBskyFeedDefs.PostView) {
		if (view.likeCount != undefined) this.likeCount = view.likeCount;
		if (view.repostCount != undefined) this.repostCount = view.repostCount;
		if (view.replyCount != undefined) this.replyCount = view.replyCount;
	}

	/**
	 * Fetch the post's current like count
	 */
	async fetchLikeCount(): Promise<number | null> {
		const response = await this.bot.agent.getPostThread({ uri: this.uri });
		if (!response.success || !AppBskyFeedDefs.isThreadViewPost(response.data.thread)) {
			throw new Error("Failed to fetch post like count\n" + JSON.stringify(response.data));
		}
		this.setCounts(response.data.thread.post);
		const { likeCount } = response.data.thread.post;
		return likeCount ?? null;
	}

	/**
	 * Fetch the post's current repost count
	 */
	async fetchRepostCount(): Promise<number | null> {
		const response = await this.bot.agent.getPostThread({ uri: this.uri });
		if (!response.success || !AppBskyFeedDefs.isThreadViewPost(response.data.thread)) {
			throw new Error("Failed to fetch post repost count\n" + JSON.stringify(response.data));
		}
		this.setCounts(response.data.thread.post);
		const { repostCount } = response.data.thread.post;
		return repostCount ?? null;
	}

	/**
	 * Fetch the post's current reply count
	 */
	async fetchReplyCount(): Promise<number | null> {
		const response = await this.bot.agent.getPostThread({ uri: this.uri });
		if (!response.success || !AppBskyFeedDefs.isThreadViewPost(response.data.thread)) {
			throw new Error("Failed to fetch post reply count\n" + JSON.stringify(response.data));
		}
		this.setCounts(response.data.thread.post);
		const { replyCount } = response.data.thread.post;
		return replyCount ?? null;
	}

	/**
	 * Fetch a list of users who liked this post.
	 * This method returns 100 likes at a time, alongside a cursor to fetch the next 100.
	 * @param cursor The cursor to begin fetching from
	 */
	async fetchLikes(
		cursor?: string,
	): Promise<{ cursor: string | undefined; likes: Array<Profile> }> {
		const response = await this.bot.agent.getLikes({
			uri: this.uri,
			cid: this.cid,
			limit: 100,
			cursor: cursor ?? "",
		});
		if (!response.success) {
			throw new Error("Failed to fetch likes\n" + JSON.stringify(response.data));
		}
		return {
			cursor: response.data.cursor,
			likes: response.data.likes.map((like) => Profile.fromView(like.actor)),
		};
	}

	/**
	 * Fetch a list of users who reposted this post.
	 * This method returns 100 reposts at a time, alongside a cursor to fetch the next 100.
	 * @param cursor The cursor to begin fetching from
	 */
	async fetchReposts(
		cursor?: string,
	): Promise<{ cursor: string | undefined; reposts: Array<Profile> }> {
		const response = await this.bot.agent.getRepostedBy({
			uri: this.uri,
			cid: this.cid,
			limit: 100,
			cursor: cursor ?? "",
		});
		if (!response.success) {
			throw new Error("Failed to fetch reposts\n" + JSON.stringify(response.data));
		}
		return {
			cursor: response.data.cursor,
			reposts: response.data.repostedBy.map((actor) => Profile.fromView(actor)),
		};
	}

	/**
	 * Like the post
	 * @returns The like's AT URI
	 */
	async like(): Promise<string> {
		return this.bot.like(this);
	}

	/**
	 * Unlike the post
	 */
	async unlike(): Promise<void> {
		return this.bot.unlike(this.uri);
	}

	/**
	 * Repost the post
	 * @returns The repost's AT URI
	 */
	async repost(): Promise<string> {
		return this.bot.repost(this);
	}

	/**
	 * Unrepost the post
	 */
	async unrepost(): Promise<void> {
		return this.bot.deleteRepost(this.uri);
	}

	/**
	 * Reply to the post
	 * @param payload The post payload
	 * @param options Optional configuration (see {@link Bot#post})
	 * @returns The new post's AT URI and CID, or a Post instance if `options.fetchAfterCreate` is true
	 */
	async reply(
		payload: PostPayload,
		options?: BotPostOptions,
	): Promise<{ uri: string; cid: string }>;
	async reply(
		payload: PostPayload,
		options?: BotPostOptions & { fetchAfterCreate: true },
	): Promise<Post>;
	async reply(
		payload: PostPayload,
		options?: BotPostOptions,
	): Promise<Post | { uri: string; cid: string }> {
		return this.bot.post({
			...payload,
			replyRef: {
				parent: { uri: this.uri, cid: this.cid },
				root: this.replyRef?.root ?? { uri: this.uri, cid: this.uri },
			},
		}, options);
	}

	/**
	 * Quote the post
	 * @param payload The post payload
	 * @param options Optional configuration (see {@link Bot#post})
	 * @returns The new post's AT URI and CID, or a Post instance if `options.fetchAfterCreate` is true
	 */
	async quote(
		payload: PostPayload,
		options?: BotPostOptions,
	): Promise<{ uri: string; cid: string }>;
	async quote(
		payload: PostPayload,
		options?: BotPostOptions & { fetchAfterCreate: true },
	): Promise<Post>;
	async quote(
		payload: PostPayload,
		options?: BotPostOptions,
	): Promise<Post | { uri: string; cid: string }> {
		return this.bot.post({ ...payload, quoted: this }, options);
	}

	/**
	 * Constructs an instance from a PostView
	 */
	static fromView(view: AppBskyFeedDefs.PostView, bot: Bot): Post {
		if (!AppBskyFeedPost.isRecord(view.record)) throw new Error("Invalid post view record");
		const post = new Post({
			...view,
			text: view.record.text,
			author: Profile.fromView(view.author),
			threadgate: undefined,
			createdAt: new Date(view.record.createdAt),
			indexedAt: view.indexedAt ? new Date(view.indexedAt) : undefined,
			embed: view.embed && isEmbedView(view.embed) && isEmbedMainRecord(view.record.embed)
				? postEmbedFromView({ view: view.embed, record: view.record.embed, bot })
				: undefined,
		}, bot);
		if (view.threadgate) {
			post.threadgate = Threadgate.fromView(view.threadgate, post);
		}
		return post;
	}

	/**
	 * Constructs an instance from a ThreadViewPost
	 */
	static fromThreadView(view: AppBskyFeedDefs.ThreadViewPost, bot: Bot): Post {
		if (!AppBskyFeedPost.isRecord(view.post.record)) {
			throw new Error("Invalid post view record");
		}

		const parent = view.parent && AppBskyFeedDefs.isThreadViewPost(view.parent)
			? Post.fromThreadView(view.parent, bot)
			: undefined;
		const children = view.replies?.map((reply) =>
			reply && AppBskyFeedDefs.isThreadViewPost(reply)
				? Post.fromThreadView(reply, bot)
				: undefined
		)?.filter((reply): reply is Post => reply !== undefined);

		return new Post({ ...Post.fromView(view.post, bot), parent, children }, bot);
	}
}
