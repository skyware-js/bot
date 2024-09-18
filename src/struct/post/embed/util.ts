import {
	AppBskyEmbedExternal,
	AppBskyEmbedImages,
	AppBskyEmbedRecord,
	AppBskyEmbedRecordWithMedia,
	AppBskyEmbedVideo,
	type BlobRef,
} from "@atproto/api";
import type { Bot } from "../../../bot/Bot.js";
import type { FeedGenerator } from "../../FeedGenerator.js";
import type { List } from "../../List.js";
import type { StarterPack } from "../../StarterPack.js";
import type { Post } from "../Post.js";
import { ExternalEmbed } from "./ExternalEmbed.js";
import { ImagesEmbed } from "./ImagesEmbed.js";
import type { PostEmbed } from "./PostEmbed.js";
import { RecordEmbed } from "./RecordEmbed.js";
import { RecordWithMediaEmbed } from "./RecordWithMediaEmbed.js";
import { VideoEmbed } from "./VideoEmbed.js";

/**
 * Options for constructing a PostEmbed from an embed view.
 */
export interface PostEmbedFromViewOptions {
	/** The embed view. */
	view:
		| AppBskyEmbedImages.View
		| AppBskyEmbedVideo.View
		| AppBskyEmbedExternal.View
		| AppBskyEmbedRecord.View
		| AppBskyEmbedRecordWithMedia.View;
	/** The embed record. */
	record?:
		| AppBskyEmbedImages.Main
		| AppBskyEmbedVideo.Main
		| AppBskyEmbedExternal.Main
		| AppBskyEmbedRecord.Main
		| AppBskyEmbedRecordWithMedia.Main;
	/** The active Bot instance (needed to create Post instance for RecordEmbed and RecordWithMediaEmbed). */
	bot?: Bot;
}

/**
 * Types of records that can be embedded in a post.
 */
export type EmbeddableRecord = Post | List | FeedGenerator | StarterPack;

/**
 * Constructs the appropriate embed type from an embed view and record.
 * @param options The options for constructing the embed.
 */
export function postEmbedFromView({ view, record, bot }: PostEmbedFromViewOptions): PostEmbed {
	if (AppBskyEmbedImages.isView(view)) {
		if (!record || !AppBskyEmbedImages.isMain(record)) {
			throw new Error("Cannot construct ImagesEmbed from view without valid embed record");
		}
		return ImagesEmbed.fromView(view, record);
	} else if (AppBskyEmbedVideo.isView(view)) {
		if (!record || !AppBskyEmbedVideo.isMain(record)) {
			throw new Error("Cannot construct VideoEmbed from view without valid embed record");
		}
		return VideoEmbed.fromView(view, record);
	} else if (AppBskyEmbedExternal.isView(view)) {
		return ExternalEmbed.fromView(view);
	} else if (AppBskyEmbedRecord.isView(view)) {
		if (!bot) throw new Error("Cannot construct RecordEmbed without bot instance");
		return RecordEmbed.fromView(view, bot);
	} else if (AppBskyEmbedRecordWithMedia.isView(view)) {
		if (!record || !AppBskyEmbedRecordWithMedia.isMain(record)) {
			throw new Error(
				"Cannot construct RecordWithMediaEmbed from view without valid embed record",
			);
		}
		if (!bot) throw new Error("Cannot construct RecordWithMediaEmbed without bot instance");
		return RecordWithMediaEmbed.fromView(view, record, bot);
	} else {
		throw new Error("Invalid post embed view: " + JSON.stringify(view));
	}
}

/**
 * Determines if the provided value is an embed record.
 * @param embed The embed to check.
 */
export function isEmbedMainRecord(
	embed: unknown,
): embed is
	| AppBskyEmbedImages.Main
	| AppBskyEmbedVideo.Main
	| AppBskyEmbedExternal.Main
	| AppBskyEmbedRecord.Main
	| AppBskyEmbedRecordWithMedia.Main
{
	return (AppBskyEmbedImages.isMain(embed)
		|| AppBskyEmbedVideo.isMain(embed)
		|| AppBskyEmbedExternal.isMain(embed)
		|| AppBskyEmbedRecord.isMain(embed)
		|| AppBskyEmbedRecordWithMedia.isMain(embed));
}

/**
 * Determines if the provided value is an embed view.
 * @param view The view to check.
 */
export function isEmbedView(
	view: unknown,
): view is
	| AppBskyEmbedImages.View
	| AppBskyEmbedVideo.View
	| AppBskyEmbedExternal.View
	| AppBskyEmbedRecord.View
	| AppBskyEmbedRecordWithMedia.View
{
	return (AppBskyEmbedImages.isView(view)
		|| AppBskyEmbedVideo.isView(view)
		|| AppBskyEmbedExternal.isView(view)
		|| AppBskyEmbedRecord.isView(view)
		|| AppBskyEmbedRecordWithMedia.isView(view));
}

export async function fetchMediaForBlob(
	url: string,
	mimeTypePrefix: string,
): Promise<{ type: string; data: Uint8Array } | null> {
	const res = await fetch(url);
	if (!res || !res.ok) return null;

	const blob = await res.blob();
	if (!blob) return null;

	const type = res.headers.get("content-type");
	if (!type?.startsWith(mimeTypePrefix)) return null;

	return { type, data: new Uint8Array(await blob.arrayBuffer()) };
}

export async function fetchExternalEmbedData(
	this: Bot,
	url: string,
): Promise<AppBskyEmbedExternal.External | null> {
	const res = await fetch(`https://cardyb.bsky.app/v1/extract?url=${encodeURIComponent(url)}`);
	if (!res || !res.ok) return null;

	const extractedEmbedData = await res.json();
	if (!extractedEmbedData || typeof extractedEmbedData !== "object") return null;
	if ("error" in extractedEmbedData && extractedEmbedData.error) return null;
	if (
		!("url" in extractedEmbedData) || typeof extractedEmbedData.url !== "string"
		|| !("title" in extractedEmbedData) || typeof extractedEmbedData.title !== "string"
		|| !("description" in extractedEmbedData)
		|| typeof extractedEmbedData.description !== "string"
	) return null;

	const { title, description } = extractedEmbedData;

	let thumb: BlobRef | undefined;
	if ("image" in extractedEmbedData && typeof extractedEmbedData.image === "string") {
		const { type, data: image } = await fetchMediaForBlob(extractedEmbedData.image, "image/")
			?? {};

		if (image && type) {
			const blob = await this.agent.com.atproto.repo.uploadBlob(image, { encoding: type });
			if (blob.success) {
				thumb = blob.data.blob;
			}
		}
	}

	return { uri: url, title, description, ...(thumb ? { thumb } : {}) };
}
