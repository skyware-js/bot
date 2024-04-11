import type { AppBskyRichtextFacet, ComAtprotoLabelDefs } from "@atproto/api";
import type { StrongRef } from "../../bot/Bot.js";
import type { RichText } from "../../richtext/RichText.js";
import type { List } from "../List.js";

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
	 */
	facets?: Array<AppBskyRichtextFacet.Main> | undefined;

	/**  A reference to the post's parent and root posts. */
	replyRef?: ReplyRef | undefined;

	/** 1-4 images to attach to the post. */
	images?: [ImagePayload?, ImagePayload?, ImagePayload?, ImagePayload?] | undefined;

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
	root?: StrongRef;
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

// Filter out `(string & {})` from LabelValue by distributing with `T extends T` then removing values to which `string` is assignable
// dprint-ignore
type LabelValues = ComAtprotoLabelDefs.LabelValue extends infer T extends string
	? T extends T
		? string extends T
			? never
			: T
		: never
	: never;
type SelfLabelValue = Exclude<
	LabelValues,
	| `!${string}` /* imperative labels */
	| "dmca-violation"
	| "doxxing" /* wouldn't want to self apply these */
>;

/**
 * Labels that can be self-applied when creating a post.
 * @enum
 */
export const PostSelfLabels = {
	/** Post media is not safe for life (e.g. graphic violence). */
	Nsfl: "nsfl",
	/** Post media contains gore. */
	Gore: "gore",
	/** Post media contains non-sexual nudity. */
	Nudity: "nudity",
	/** Post media contains sexual content. */
	Sexual: "sexual",
	/** Post media contains pornographic content. */
	Porn: "porn",
} as const satisfies Record<Capitalize<SelfLabelValue>, SelfLabelValue>;
export type PostSelfLabels = typeof PostSelfLabels[keyof typeof PostSelfLabels];
