import type { ExternalEmbed } from "./ExternalEmbed.js";
import type { ImagesEmbed } from "./ImagesEmbed.js";
import type { RecordEmbed } from "./RecordEmbed.js";
import type { RecordWithMediaEmbed } from "./RecordWithMediaEmbed.js";
import type { VideoEmbed } from "./VideoEmbed.js";

/**
 * A post embed.
 */
export class PostEmbed {
	/** Whether this embed contains images. */
	isImages(): this is ImagesEmbed {
		return false;
	}

	/** Whether this embed contains a video. */
	isVideo(): this is VideoEmbed {
		return false;
	}

	/** Whether this embed is an external link. */
	isExternal(): this is ExternalEmbed {
		return false;
	}

	/** Whether this embed contains a record. */
	isRecord(): this is RecordEmbed {
		return false;
	}

	/** Whether this embed contains a record with media. */
	isRecordWithMedia(): this is RecordWithMediaEmbed {
		return false;
	}
}
