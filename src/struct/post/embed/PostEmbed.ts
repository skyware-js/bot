import type { ExternalEmbed } from "./ExternalEmbed";
import type { ImagesEmbed } from "./ImagesEmbed";
import type { RecordEmbed } from "./RecordEmbed";
import type { RecordWithMediaEmbed } from "./RecordWithMediaEmbed";

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
