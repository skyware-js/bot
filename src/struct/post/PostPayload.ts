import {
	AppBskyEmbedExternal,
	AppBskyEmbedImages,
	AppBskyEmbedRecord,
	AppBskyEmbedRecordWithMedia,
	type AppBskyFeedPost,
	type AppBskyRichtextFacet,
	ComAtprotoLabelDefs,
} from "@atproto/api";

/**
 * Data that can be used to construct a PostPayload class
 */
export type PostPayloadData =
	& Pick<
		AppBskyFeedPost.Record,
		"text" | "facets" | "reply" | "langs" | "embed" | "labels" | "tags"
	>
	& { createdAt?: Date };

type ImagesEmbed = AppBskyEmbedImages.Main;
type ExternalEmbed = AppBskyEmbedExternal.Main;
type RecordEmbed = AppBskyEmbedRecord.Main;
type RecordWithMediaEmbed = AppBskyEmbedRecordWithMedia.Main;

export type PostEmbed = ImagesEmbed | ExternalEmbed | RecordEmbed | RecordWithMediaEmbed;

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

	constructor({ text, facets, reply, langs, embed, labels, tags, createdAt }: PostPayloadData) {
		this.text = text;

		if (facets) this.facets = facets;

		if (reply) this.replyRef = reply;

		if (langs) this.langs = langs;

		if (embed) {
			if (!isValidEmbed(embed)) {
				throw new Error("Invalid post embed: " + JSON.stringify(embed));
			}
			this.embed = embed;
		}

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

export function isValidEmbed(embed: unknown): embed is PostEmbed {
	return (AppBskyEmbedImages.isMain(embed)
		|| AppBskyEmbedExternal.isMain(embed)
		|| AppBskyEmbedRecord.isMain(embed)
		|| AppBskyEmbedRecordWithMedia.isMain(embed));
}
