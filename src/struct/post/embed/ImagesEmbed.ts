import type { EmbedImage } from "./EmbedImage";
import { PostEmbed } from "./PostEmbed";

/**
 * A post embed that contains 1 to 4 images
 */
export class ImagesEmbed extends PostEmbed {
	constructor(
		/**
		 * The images within this embed
		 */
		public images: Array<EmbedImage>,
	) {
		super();
	}

	override isImages(): this is ImagesEmbed {
		return true;
	}
}
