import {
	AppBskyEmbedRecord,
	AppBskyFeedDefs,
	AppBskyFeedPost,
	AppBskyGraphDefs,
} from "@atproto/api";
import type { Bot } from "../../../bot/Bot.js";
import { FeedGenerator } from "../../FeedGenerator.js";
import { List } from "../../List.js";
import { Post } from "../Post.js";
import { PostEmbed } from "./PostEmbed.js";

/**
 * A post embed that links to a post, list, or feed generator record.
 */
export class RecordEmbed extends PostEmbed {
	/**
	 * @param record The embedded record.
	 */
	constructor(public record: Post | List | FeedGenerator) {
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
		if (AppBskyEmbedRecord.isViewRecord(recordView.record)) {
			// ViewRecord should only be a post
			if (!AppBskyFeedPost.isRecord(recordView.record.value)) {
				throw new Error("Invalid post view record");
			}
			return new RecordEmbed(
				Post.fromView({ ...recordView.record, record: recordView.record.value }, bot),
			);
		} else if (AppBskyFeedDefs.isGeneratorView(recordView.record)) {
			return new RecordEmbed(FeedGenerator.fromView(recordView.record, bot));
		} else if (AppBskyGraphDefs.isListView(recordView.record)) {
			return new RecordEmbed(List.fromView(recordView.record, bot));
		} else {
			throw new Error("Invalid embed record");
		}
	}
}
