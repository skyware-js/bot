import {
	AppBskyEmbedExternal,
	AppBskyEmbedImages,
	AppBskyEmbedRecord,
	AppBskyEmbedRecordWithMedia,
} from "@atproto/api";
import { ExternalEmbed } from "./ExternalEmbed";
import { ImagesEmbed } from "./ImagesEmbed";
import { PostEmbed } from "./PostEmbed";
import { RecordEmbed } from "./RecordEmbed";

/**
 * Constructs the appropriate embed type from an embed view and record
 * @param view
 * @param record
 */
export function postEmbedFromView(
	view:
		| AppBskyEmbedImages.View
		| AppBskyEmbedExternal.View
		| AppBskyEmbedRecord.View
		| AppBskyEmbedRecordWithMedia.View,
	record?:
		| AppBskyEmbedImages.Main
		| AppBskyEmbedExternal.Main
		| AppBskyEmbedRecord.Main
		| AppBskyEmbedRecordWithMedia.Main,
): PostEmbed {
	if (AppBskyEmbedImages.isView(view)) {
		if (!record || !AppBskyEmbedImages.isMain(record)) {
			throw new Error("Cannot construct ImagesEmbed from view without valid embed record");
		}
		return ImagesEmbed.fromView(view, record);
	} else if (AppBskyEmbedExternal.isView(view)) {
		return ExternalEmbed.fromView(view);
	} else if (AppBskyEmbedRecord.isView(view)) {
		return RecordEmbed.fromView(view);
	} else {
		throw new Error("Invalid post embed view: " + JSON.stringify(view));
	}
}

/**
 * Determines if the provided value is an embed record
 * @param embed
 */
export function isEmbedMainRecord(
	embed: unknown,
): embed is
	| AppBskyEmbedImages.Main
	| AppBskyEmbedExternal.Main
	| AppBskyEmbedRecord.Main
	| AppBskyEmbedRecordWithMedia.Main
{
	return (AppBskyEmbedImages.isMain(embed)
		|| AppBskyEmbedExternal.isMain(embed)
		|| AppBskyEmbedRecord.isMain(embed)
		|| AppBskyEmbedRecordWithMedia.isMain(embed));
}

/**
 * Determines if the provided value is an embed view
 * @param view
 */
export function isEmbedView(
	view: unknown,
): view is
	| AppBskyEmbedImages.View
	| AppBskyEmbedExternal.View
	| AppBskyEmbedRecord.View
	| AppBskyEmbedRecordWithMedia.View
{
	return (AppBskyEmbedImages.isView(view)
		|| AppBskyEmbedExternal.isView(view)
		|| AppBskyEmbedRecord.isView(view)
		|| AppBskyEmbedRecordWithMedia.isView(view));
}
