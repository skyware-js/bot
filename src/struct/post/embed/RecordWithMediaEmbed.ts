import type { AppBskyEmbedRecordWithMedia } from "@atcute/bluesky";
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
import { VideoEmbed } from "./VideoEmbed.js";

/**
 * A post embed that links to a record in addition to either images or external content.
 */
export class RecordWithMediaEmbed extends PostEmbed {
	/**
	 * @param record The embedded post record.
	 * @param media The media within this embed.
	 */
	constructor(
		public record: EmbeddableRecord | null,
		public media: ImagesEmbed | VideoEmbed | ExternalEmbed,
	) {
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
		let embeddedMedia: ImagesEmbed | VideoEmbed | ExternalEmbed;

		if (
			view.media.$type === "app.bsky.embed.images#view"
			&& record.media.$type === "app.bsky.embed.images"
		) {
			embeddedMedia = ImagesEmbed.fromView(view.media, record.media);
		} else if (
			view.media.$type === "app.bsky.embed.video#view"
			&& record.media.$type === "app.bsky.embed.video"
		) {
			embeddedMedia = VideoEmbed.fromView(view.media, record.media);
		} else if (
			view.media.$type === "app.bsky.embed.external#view"
			&& record.media.$type === "app.bsky.embed.external"
		) {
			embeddedMedia = ExternalEmbed.fromView(view.media);
		} else {
			throw new Error("Invalid embed media record type: " + record.media.$type);
		}

		if (view.record.record.$type === "app.bsky.embed.record#viewRecord") {
			// Record should only be a post
			if (!is("app.bsky.feed.post", view.record.record.value)) {
				throw new Error(
					"Invalid post view record type: " + view.record.record.value.$type,
				);
			}
			return new RecordWithMediaEmbed(
				Post.fromView({ ...view.record.record, record: view.record.record.value, $type: "app.bsky.feed.defs#postView" }, bot),
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
		} else if (
			view.record.record.$type === "app.bsky.embed.record#viewNotFound"
			|| view.record.record.$type === "app.bsky.embed.record#viewBlocked"
			|| view.record.record.$type === "app.bsky.embed.record#viewDetached"
		) {
			return new RecordWithMediaEmbed(null, embeddedMedia);
		} else {
			// @ts-expect-error — exhaustiveness check
			throw new Error("Invalid post view record type: " + view.record.record.$type);
		}
	}
}
