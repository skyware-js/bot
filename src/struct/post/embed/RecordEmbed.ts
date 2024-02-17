import type { Post } from "../Post";
import { PostEmbed } from "./PostEmbed";

/**
 * A post embed that links to a post, list, or feed generator record
 */
export class RecordEmbed extends PostEmbed {
	constructor(
		/** The embedded record */
		public record: Post, // TODO: implement List and FeedGenerator
	) {
		super();
	}

	override isRecord(): this is RecordEmbed {
		return true;
	}
}
