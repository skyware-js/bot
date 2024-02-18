import { type AppBskyFeedPost, type AppBskyRichtextFacet, ComAtprotoLabelDefs } from "@atproto/api";
import type { PostEmbed } from "./embed/PostEmbed";

/**
 * Data that can be used to construct a PostPayload class
 */
export interface PostPayloadData {
	text: string;
	facets?: Array<AppBskyRichtextFacet.Main> | undefined;
	replyRef?: AppBskyFeedPost.ReplyRef | undefined;
	langs?: Array<string> | undefined;
	embed?: PostEmbed | undefined;
	labels?: ComAtprotoLabelDefs.SelfLabels | undefined;
	tags?: Array<string> | undefined;
	createdAt?: Date | undefined;
}

/**
 * The base class for a post on Bluesky
 */
export class PostPayload {
	/**
	 * The text of the post
	 */
	text: string;

	/**
	 * A facet represents a range within the post's text that has special meaning
	 * (e.g. mentions, links, tags)
	 * @see https://www.docs.bsky.app/docs/advanced-guides/post-richtext#rich-text-facets
	 */
	facets?: Array<AppBskyRichtextFacet.Main>;

	/**
	 * A reference to the post's parent and root posts
	 */
	replyRef?: AppBskyFeedPost.ReplyRef;

	/**
	 * A list of two-letter language codes that the post is written in
	 */
	langs?: Array<string>;

	/**
	 * The embed attached to the post, if there is any
	 */
	embed?: PostEmbed;

	/**
	 * The labels attached to the post, if there are any
	 */
	labels?: ComAtprotoLabelDefs.SelfLabels;

	/**
	 * Additional non-inline tags attached to the post
	 */
	tags?: Array<string>;

	/**
	 * The time the post was created
	 */
	createdAt: Date;

	constructor(
		{ text, facets, replyRef, langs, embed, labels, tags, createdAt }: PostPayloadData,
	) {
		this.text = text;

		if (facets) this.facets = facets;

		if (replyRef) this.replyRef = replyRef;

		if (langs) this.langs = langs;

		if (embed) this.embed = embed;

		if (labels) {
			if (!ComAtprotoLabelDefs.isSelfLabels(labels)) {
				throw new Error("Invalid post labels: " + JSON.stringify(labels));
			}
			this.labels = labels;
		}

		if (tags) this.tags = tags;

		this.createdAt = createdAt ?? new Date();
	}
}
