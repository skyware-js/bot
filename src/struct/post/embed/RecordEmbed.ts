import type { AppBskyEmbedRecord } from "@atcute/client/lexicons";
import type { Bot } from "../../../bot/Bot.js";
import { is } from "../../../util/lexicon.js";
import { FeedGenerator } from "../../FeedGenerator.js";
import { Labeler } from "../../Labeler.js";
import { List } from "../../List.js";
import { StarterPack } from "../../StarterPack.js";
import { Post } from "../Post.js";
import { PostEmbed } from "./PostEmbed.js";
import type { EmbeddableRecord } from "./util.js";

/**
 * A post embed that links to a post, list, or feed generator record.
 */
export class RecordEmbed extends PostEmbed {
	/**
	 * @param record The embedded record.
	 */
	constructor(public record: EmbeddableRecord) {
		super();
	}

	override isRecord(): this is RecordEmbed {
		return true;
	}

	/**
	 * Constructs a RecordEmbed from an embed record view.
	 * @param recordView The view of the embed record.
	 * @param bot The active Bot instance.
	 */
	static fromView(recordView: AppBskyEmbedRecord.View, bot: Bot): RecordEmbed {
		if (recordView.record.$type === "app.bsky.embed.record#viewRecord") {
			// ViewRecord should only be a post
			if (!is("app.bsky.feed.post", recordView.record.value)) {
				throw new Error(
					"Invalid post view record type: " + (recordView.record.value as any).$type,
				);
			}
			return new RecordEmbed(
				Post.fromView({ ...recordView.record, record: recordView.record.value }, bot),
			);
		} else if (recordView.record.$type === "app.bsky.feed.defs#generatorView") {
			return new RecordEmbed(FeedGenerator.fromView(recordView.record, bot));
		} else if (recordView.record.$type === "app.bsky.graph.defs#listView") {
			return new RecordEmbed(List.fromView(recordView.record, bot));
		} else if (recordView.record.$type === "app.bsky.graph.defs#starterPackViewBasic") {
			return new RecordEmbed(StarterPack.fromView(recordView.record, bot));
		} else if (recordView.record.$type === "app.bsky.labeler.defs#labelerView") {
			return new RecordEmbed(Labeler.fromView(recordView.record, bot));
		} else {
			throw new Error("Invalid embed record type: " + recordView.record.$type);
		}
	}
}
