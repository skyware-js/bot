import type { AppBskyFeedPost, AppBskyRichtextFacet } from "@atproto/api";
import type { FeedGenerator } from "../FeedGenerator";
import type { List } from "../List";
import type { Post } from "./Post";

/**
 * Data that can be used to create a post
 */
export interface PostPayload {
	/** The post text */
	text: string;

	/**
	 * A facet represents a range within the post's text that has special meaning
	 * (e.g. mentions, links, tags)
	 * @see https://www.docs.bsky.app/docs/advanced-guides/post-richtext#rich-text-facets
	 */
	facets?: Array<AppBskyRichtextFacet.Main> | undefined;

	/**  A reference to the post's parent and root posts */
	replyRef?: AppBskyFeedPost.ReplyRef | undefined;

	/** 1-4 images to attach to the post */
	images?: [ImagePayload?, ImagePayload?, ImagePayload?, ImagePayload?] | undefined;

	/** A link to a post, list, or feed generator to be embedded within the post */
	quoted?: Post | List | FeedGenerator | undefined;

	/** An external embed to attach to the post */
	external?: {
		/** The URI of the external content */
		uri: string;
		/** The title of the external content */
		title: string;
		/** The description of the external content */
		description: string;
		/** The thumbnail image associated with the external content */
		thumb?: ImagePayload;
	} | undefined;

	/** A list of two-letter language codes that the post is written in */
	langs?: Array<string> | undefined;

	/** The labels to attach to the post, if there are any */
	labels?: Array<PostSelfLabels> | undefined;

	/** Additional non-inline tags to attach to the post */
	tags?: Array<string> | undefined;

	/** An optional threadgate to be applied to the post */
	threadgate?: {
		/** Whether users mentioned in the post are allowed to reply */
		allowMentioned?: boolean;
		/** Whether users followed by the bot are allowed to reply */
		allowFollowing?: boolean;
		/** Lists or AT URIs pointing to lists whose members are allowed to reply */
		allowLists?: Array<string> | Array<List>;
	} | undefined;

	/**
	 * The time the post was created
	 * @default new Date()
	 */
	createdAt?: Date | undefined;
}

export interface ImagePayload {
	/** Alt text for the image */
	alt?: string;

	/** The image's aspect ratio */
	aspectRatio?: { width: number; height: number };

	/** The image's data */
	data: Uint8Array;
}

export const PostSelfLabels = { Suggestive: "suggestive", Nudity: "nudity", Porn: "porn" };
export type PostSelfLabels = typeof PostSelfLabels[keyof typeof PostSelfLabels];
