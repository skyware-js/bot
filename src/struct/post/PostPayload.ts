import type { ComAtprotoLabelDefs } from "@atcute/atproto";
import type { AppBskyEmbedVideo, AppBskyRichtextFacet } from "@atcute/bluesky";
import type RichText from "@atcute/bluesky-richtext-builder";
import type { StrongRef } from "../../bot/Bot.js";
import type { List } from "../List.js";
import type { Facet } from "./Facet.js";

/**
 * Data that can be used to create a post.
 */
export interface PostPayload {
	/** The post text. Can be a string or a RichText instance containing facets. */
	text: string | RichText;

	/**
	 * A facet represents a range within the post's text that has special meaning
	 * (e.g. mentions, links, tags). Prefer to use the {@link RichText} class to create
	 * posts with facets.
	 * This will override any facets present in the {@link text} property or detected automatically.
	 */
	facets?: Array<Facet | AppBskyRichtextFacet.Main> | undefined;

	/**  A reference to the post's parent and root posts. */
	replyRef?: ReplyRef | undefined;

	/** 1-4 images to attach to the post. */
	images?: [ImagePayload?, ImagePayload?, ImagePayload?, ImagePayload?] | undefined;

	/** A video to attach to the post. */
	video?: VideoPayload | undefined;

	/** A link to a post, list, or feed generator to be embedded within the post. */
	quoted?: StrongRef | undefined;

	/**
	 * An external embed to attach to the post.
	 * Can either be a link to resolve the embed preview from, or an object for more fine-grained control.
	 */
	external?: string | ExternalEmbedPayload | undefined;

	/** A list of two-letter language codes that the post is written in. */
	langs?: Array<string> | undefined;

	/** The labels to attach to the post, if there are any. */
	labels?: Array<PostSelfLabels> | undefined;

	/** Additional non-inline tags to attach to the post. */
	tags?: Array<string> | undefined;

	/** An optional threadgate to be applied to the post. */
	threadgate?: {
		/** Whether users mentioned in the post are allowed to reply. */
		allowMentioned?: boolean;
		/** Whether users followed by the bot are allowed to reply. */
		allowFollowing?: boolean;
		/** Lists or AT URIs pointing to lists whose members are allowed to reply. */
		allowLists?: Array<string> | Array<List>;
	} | undefined;

	/**
	 * The time the post was created.
	 * @default new Date()
	 */
	createdAt?: Date | undefined;
}

/**
 * A reference to a post's parent and root posts.
 */
export interface ReplyRef {
	/** A reference to the parent post. */
	parent: StrongRef;

	/** A reference to the root post. */
	root: StrongRef;
}

/**
 * Data for an external embed to be attached to a post.
 */
export interface ExternalEmbedPayload {
	/** The URI of the external content. */
	uri: string;

	/** The title of the external content. */
	title: string;

	/** The description of the external content. */
	description: string;

	/** The thumbnail image associated with the external content. */
	thumb?: ImagePayload;
}

/**
 * Data for an image to be attached to a post.
 */
export interface ImagePayload {
	/** Alt text for the image. */
	alt?: string;

	/** The image's aspect ratio. */
	aspectRatio?: { width: number; height: number };

	/** The image's data, or a URL leading to an image. */
	data: Blob | string;
}

/**
 * Data for a video to be attached to a post.
 */
export interface VideoPayload {
	/** Alt text for the video. */
	alt?: string;

	/** The video's aspect ratio. */
	aspectRatio?: { width: number; height: number };

	/** Sets of closed captions for the video. */
	captions?: Array<AppBskyEmbedVideo.Caption>;

	/** The video's data, or a URL leading to a video. */
	data: Blob | string;
}

type SelfLabelValue = Exclude<ComAtprotoLabelDefs.LabelValue, `!${string}` /* imperative labels */>;

/**
 * Labels that can be self-applied when creating a post.
 * @enum
 */
export const PostSelfLabels = {
	/** Post media contains graphic content. */
	GraphicMedia: "graphic-media",
	/** Post media contains non-sexual nudity. */
	Nudity: "nudity",
	/** Post media contains sexual content. */
	Sexual: "sexual",
	/** Post media contains pornographic content. */
	Porn: "porn",
} as const satisfies Record<string, SelfLabelValue>;
export type PostSelfLabels = typeof PostSelfLabels[keyof typeof PostSelfLabels];
