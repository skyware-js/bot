import {
	AppBskyFeedDefs,
	AppBskyFeedPost,
	AppBskyRichtextFacet,
	ComAtprotoLabelDefs,
} from "@atproto/api";
import { Profile } from "../Profile";
import { PostEmbed } from "./embed/PostEmbed";
import { isEmbedMainRecord, isEmbedView, postEmbedFromView } from "./embed/util";

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
	createdAt?: Date | undefined;
	indexedAt?: Date | undefined;
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

	/** The time the post was created */
	createdAt: Date;

	/** The time the post was indexed by the App View */
	indexedAt?: Date;

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
			createdAt = new Date(),
			indexedAt,
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

		this.createdAt = createdAt;
		if (indexedAt) this.indexedAt = indexedAt;
	}

	/**
	 * Constructs an instance from a PostView
	 */
	static fromView(view: AppBskyFeedDefs.PostView): Post {
		if (!AppBskyFeedPost.isRecord(view.record)) throw new Error("Invalid post view record");
		return new Post({
			...view,
			text: view.record.text,
			author: Profile.fromView(view.author),
			createdAt: new Date(view.record.createdAt),
			indexedAt: view.indexedAt ? new Date(view.indexedAt) : undefined,
			embed: view.embed && isEmbedView(view.embed) && isEmbedMainRecord(view.record.embed)
				? postEmbedFromView(view.embed, view.record.embed)
				: undefined,
		});
	}
}
