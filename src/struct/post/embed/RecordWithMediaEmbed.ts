import type { Post } from "../Post";
import type { ExternalEmbed } from "./ExternalEmbed";
import type { ImagesEmbed } from "./ImagesEmbed";
import { PostEmbed } from "./PostEmbed";

/**
 * A post embed that links to a record in addition to either images or external content
 */
export class RecordWithMediaEmbed extends PostEmbed {
	constructor(
		/** The embedded record */
		public record: Post, // TODO: implement List and FeedGenerator
		/** The media within this embed */
		public media: ImagesEmbed | ExternalEmbed,
	) {
		super();
	}

	override isRecordWithMedia(): this is RecordWithMediaEmbed {
		return true;
	}
}
