import type { AppBskyEmbedImages } from "@atproto/api";
import { EmbedImage } from "./EmbedImage";
import { PostEmbed } from "./PostEmbed";

/**
 * A post embed that contains 1 to 4 images
 */
export class ImagesEmbed extends PostEmbed {
	constructor(
		/** The images within this embed */
		public images: Array<EmbedImage>,
	) {
		super();
	}

	override isImages(): this is ImagesEmbed {
		return true;
	}

	/**
	 * Constructs an ImagesEmbed from an embed view and a record
	 * @param imagesView The view of the embed
	 * @param imagesRecord The embed images record
	 */
	static fromView(
		imagesView: AppBskyEmbedImages.View,
		imagesRecord: AppBskyEmbedImages.Main,
	): ImagesEmbed {
		const images: Array<EmbedImage> = [];
		for (let i = 0; i < imagesRecord.images.length; i++) {
			images.push(
				new EmbedImage({
					...imagesView.images[i],
					cid: imagesRecord.images[i].image.ref.toString(),
					mimeType: imagesRecord.images[i].image.mimeType,
					size: imagesRecord.images[i].image.size,
				}),
			);
		}
		return new ImagesEmbed(images);
	}
}
