import {
	AppBskyEmbedRecord,
	AppBskyFeedDefs,
	AppBskyFeedPost,
	AppBskyGraphDefs,
} from "@atproto/api";
import { Bot } from "../../../bot/Bot";
import { FeedGenerator } from "../../FeedGenerator";
import { List } from "../../List";
import { Post } from "../Post";
import { PostEmbed } from "./PostEmbed";

/**
 * A post embed that links to a post, list, or feed generator record
 */
export class RecordEmbed extends PostEmbed {
	constructor(
		/** The embedded record */
		public record: Post | List | FeedGenerator,
	) {
		super();
	}

	override isRecord(): this is RecordEmbed {
		return true;
	}

	/**
	 * Constructs a RecordEmbed from an embed record view
	 * @param recordView The view of the embed record
	 * @param bot The active Bot instance
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
