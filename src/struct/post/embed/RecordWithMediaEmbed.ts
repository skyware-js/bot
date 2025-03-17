import type { AppBskyEmbedRecordWithMedia } from "@atcute/client/lexicons";
import type { Bot } from "../../../bot/Bot.js";
import { is } from "../../../util/lexicon.js";
import { FeedGenerator } from "../../FeedGenerator.js";
import { Labeler } from "../../Labeler.js";
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

		if (
			view.media.$type === "app.bsky.embed.images#view"
			&& record.media.$type === "app.bsky.embed.images"
		) {
			embeddedMedia = ImagesEmbed.fromView(view.media, record.media);
		} else if (
			view.media.$type === "app.bsky.embed.external#view"
			&& record.media.$type === "app.bsky.embed.external"
		) {
			embeddedMedia = ExternalEmbed.fromView(view.media);
		} else {
			throw new Error("Invalid embed media record");
		}

		if (
			view.record.record.$type === "app.bsky.embed.record#viewRecord"
			&& is("app.bsky.feed.post", view.record.record.value)
		) {
			return new RecordWithMediaEmbed(
				Post.fromView({ ...view.record.record, record: view.record.record.value }, bot),
				embeddedMedia,
			);
		} else if (view.record.record.$type === "app.bsky.feed.defs#generatorView") {
			return new RecordWithMediaEmbed(
				FeedGenerator.fromView(view.record.record, bot),
				embeddedMedia,
			);
		} else if (view.record.record.$type === "app.bsky.graph.defs#listView") {
			return new RecordWithMediaEmbed(List.fromView(view.record.record, bot), embeddedMedia);
		} else if (view.record.record.$type === "app.bsky.graph.defs#starterPackViewBasic") {
			return new RecordWithMediaEmbed(
				StarterPack.fromView(view.record.record, bot),
				embeddedMedia,
			);
		} else if (view.record.record.$type === "app.bsky.labeler.defs#labelerView") {
			return new RecordWithMediaEmbed(
				Labeler.fromView(view.record.record, bot),
				embeddedMedia,
			);
		} else {
			throw new Error("Invalid post view record");
		}
	}
}
