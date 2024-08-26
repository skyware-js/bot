import {
	AppBskyEmbedExternal,
	AppBskyEmbedImages,
	AppBskyEmbedRecord,
	type AppBskyEmbedRecordWithMedia,
	AppBskyFeedDefs,
	AppBskyFeedPost,
	AppBskyGraphDefs,
} from "@atproto/api";
import type { Bot } from "../../../bot/Bot.js";
import { FeedGenerator } from "../../FeedGenerator.js";
import { List } from "../../List.js";
import { StarterPack } from "../../StarterPack.js";
import { Post } from "../Post.js";
import { ExternalEmbed } from "./ExternalEmbed.js";
import { ImagesEmbed } from "./ImagesEmbed.js";
import { PostEmbed } from "./PostEmbed.js";
import type { EmbeddableRecord } from "./util.js";

/**
 * A post embed that links to a record in addition to either images or external content.
 */
export class RecordWithMediaEmbed extends PostEmbed {
	/**
	 * @param record The embedded post record.
	 * @param media The media within this embed.
	 */
	constructor(public record: EmbeddableRecord, public media: ImagesEmbed | ExternalEmbed) {
		super();
	}

	override isRecordWithMedia(): this is RecordWithMediaEmbed {
		return true;
	}

	/**
	 * Constructs a RecordWithMediaEmbed from an embed view and a record.
	 * @param view The view of the embed.
	 * @param record The embed record.
	 * @param bot The active Bot instance.
	 */
	static fromView(
		view: AppBskyEmbedRecordWithMedia.View,
		record: AppBskyEmbedRecordWithMedia.Main,
		bot: Bot,
	): RecordWithMediaEmbed {
		let embeddedMedia: ImagesEmbed | ExternalEmbed;

		if (AppBskyEmbedImages.isView(view.media) && AppBskyEmbedImages.isMain(record.media)) {
			embeddedMedia = ImagesEmbed.fromView(view.media, record.media);
		} else if (
			AppBskyEmbedExternal.isView(view.media) && AppBskyEmbedExternal.isMain(record.media)
		) {
			embeddedMedia = ExternalEmbed.fromView(view.media);
		} else {
			throw new Error("Invalid embed media record");
		}

		if (
			AppBskyEmbedRecord.isViewRecord(view.record.record)
			&& AppBskyFeedPost.isRecord(view.record.record.value)
		) {
			return new RecordWithMediaEmbed(
				Post.fromView({ ...view.record.record, record: view.record.record.value }, bot),
				embeddedMedia,
			);
		} else if (AppBskyFeedDefs.isGeneratorView(view.record.record)) {
			return new RecordWithMediaEmbed(
				FeedGenerator.fromView(view.record.record, bot),
				embeddedMedia,
			);
		} else if (AppBskyGraphDefs.isListView(view.record.record)) {
			return new RecordWithMediaEmbed(List.fromView(view.record.record, bot), embeddedMedia);
		} else if (AppBskyGraphDefs.isStarterPackViewBasic(view.record.record)) {
			return new RecordWithMediaEmbed(
				StarterPack.fromView(view.record.record, bot),
				embeddedMedia,
			);
		} else {
			throw new Error("Invalid post view record");
		}
	}
}
