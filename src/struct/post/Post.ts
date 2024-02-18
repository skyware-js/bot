import {
	AppBskyFeedDefs,
	AppBskyFeedPost,
	AppBskyRichtextFacet,
	ComAtprotoLabelDefs,
} from "@atproto/api";
import { Profile } from "../Profile";
import { PostEmbed } from "./embed/PostEmbed";
import { isEmbedMainRecord, isEmbedView, postEmbedFromView } from "./embed/util";
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
		{
			text,
			uri,
			cid,
			author,
			facets,
			replyRef,
			langs,
			embed,
			labels,
			tags,
			threadgate,
			createdAt = new Date(),
			indexedAt,
			parent,
			root,
			children,
		}: PostData,
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
		if (threadgate) this.threadgate = threadgate;

		this.createdAt = createdAt;
		if (indexedAt) this.indexedAt = indexedAt;

		if (parent) this._parent = parent;
		if (root) this._root = root;
		if (children) this._children = children;
	}

	/**
	 * Constructs an instance from a PostView
	 */
	static fromView(view: AppBskyFeedDefs.PostView): Post {
		if (!AppBskyFeedPost.isRecord(view.record)) throw new Error("Invalid post view record");
		const post = new Post({
			...view,
			text: view.record.text,
			author: Profile.fromView(view.author),
			threadgate: undefined,
			createdAt: new Date(view.record.createdAt),
			indexedAt: view.indexedAt ? new Date(view.indexedAt) : undefined,
			embed: view.embed && isEmbedView(view.embed) && isEmbedMainRecord(view.record.embed)
				? postEmbedFromView(view.embed, view.record.embed)
				: undefined,
		});
		if (view.threadgate) {
			post.threadgate = Threadgate.fromView(view.threadgate, post);
		}
		return post;
	}

	/**
	 * Constructs an instance from a ThreadViewPost
	 */
	static fromThreadView(view: AppBskyFeedDefs.ThreadViewPost): Post {
		if (!AppBskyFeedPost.isRecord(view.post.record)) {
			throw new Error("Invalid post view record");
		}

		const parent = view.parent && AppBskyFeedDefs.isThreadViewPost(view.parent)
			? Post.fromThreadView(view.parent)
			: undefined;
		const children = view.replies?.map((reply) =>
			reply && AppBskyFeedDefs.isThreadViewPost(reply)
				? Post.fromThreadView(reply)
				: undefined
		)?.filter((reply): reply is Post => reply !== undefined);

		return new Post({ ...Post.fromView(view.post), parent, children });
	}
}
