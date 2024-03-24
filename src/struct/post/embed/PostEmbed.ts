import type { ExternalEmbed } from "./ExternalEmbed.js";
import type { ImagesEmbed } from "./ImagesEmbed.js";
import type { RecordEmbed } from "./RecordEmbed.js";
import type { RecordWithMediaEmbed } from "./RecordWithMediaEmbed.js";

/**
 * A post embed.
 */
export class PostEmbed {
	isImages(): this is ImagesEmbed {
		return false;
	}

	isExternal(): this is ExternalEmbed {
		return false;
	}

	isRecord(): this is RecordEmbed {
		return false;
	}

	isRecordWithMedia(): this is RecordWithMediaEmbed {
		return false;
	}
}
