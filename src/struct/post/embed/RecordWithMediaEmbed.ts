import {
	AppBskyEmbedExternal,
	AppBskyEmbedImages,
	AppBskyEmbedRecord,
	AppBskyEmbedRecordWithMedia,
	AppBskyFeedPost,
} from "@atproto/api";
import { Bot } from "../../../bot/Bot";
import { Post } from "../Post";
import { ExternalEmbed } from "./ExternalEmbed";
import { ImagesEmbed } from "./ImagesEmbed";
import { PostEmbed } from "./PostEmbed";

/**
 * A post embed that links to a record in addition to either images or external content
 */
export class RecordWithMediaEmbed extends PostEmbed {
	constructor(
		/** The embedded post record */
		public record: Post,
		/** The media within this embed */
		public media: ImagesEmbed | ExternalEmbed,
	) {
		super();
	}

	override isRecordWithMedia(): this is RecordWithMediaEmbed {
		return true;
	}

	/**
	 * Constructs a RecordWithMediaEmbed from an embed view and a record
	 * @param view The view of the embed
	 * @param record The embed record
	 * @param bot The active Bot instance
	 */
	static fromView(
		view: AppBskyEmbedRecordWithMedia.View,
		record: AppBskyEmbedRecordWithMedia.Main,
		bot: Bot,
	): RecordWithMediaEmbed {
		let embeddedMedia: ImagesEmbed | ExternalEmbed;

		// Determine the type of media in the embed — either images or external content
		if (AppBskyEmbedImages.isView(view.media) && AppBskyEmbedImages.isMain(record.media)) {
			embeddedMedia = ImagesEmbed.fromView(view.media, record.media);
		} else if (
			AppBskyEmbedExternal.isView(view.media) && AppBskyEmbedExternal.isMain(record.media)
		) {
			embeddedMedia = ExternalEmbed.fromView(view.media);
		} else {
			throw new Error("Invalid embed media record");
		}

		// It doesn't appear to be possible to have an EmbedRecordWithMedia that isn't quote post + media;
		// this may be incorrect though
		if (
			AppBskyEmbedRecord.isViewRecord(view.record.record)
			&& AppBskyFeedPost.isRecord(view.record.record.value)
		) {
			return new RecordWithMediaEmbed(
				Post.fromView({ ...view.record.record, record: view.record.record.value }, bot),
				embeddedMedia,
			);
		} else {
			throw new Error("Invalid post view record");
		}
	}
}
