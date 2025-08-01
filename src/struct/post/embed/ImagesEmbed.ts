import type { AppBskyEmbedImages } from "@atcute/bluesky";
import { EmbedImage } from "./EmbedImage.js";
import { PostEmbed } from "./PostEmbed.js";

/**
 * A post embed that contains 1 to 4 images.
 */
export class ImagesEmbed extends PostEmbed {
	/**
	 * @param images The images within this embed.
	 */
	constructor(public images: Array<EmbedImage>) {
		super();
	}

	override isImages(): this is ImagesEmbed {
		return true;
	}

	/**
	 * Constructs an ImagesEmbed from an embed view and a record.
	 * @param imagesView The view of the embed.
	 * @param imagesRecord The embed images record.
	 */
	static fromView(
		imagesView: AppBskyEmbedImages.View,
		imagesRecord: AppBskyEmbedImages.Main,
	): ImagesEmbed {
		const images: Array<EmbedImage> = [];
		for (let i = 0; i < imagesRecord.images.length; i++) {
			const image = imagesRecord.images[i].image;
			images.push(
				new EmbedImage({
					...imagesView.images[i],
					cid: "cid" in image ? image.cid : image.ref.$link,
					mimeType: image.mimeType,
					size: "size" in image ? image.size : undefined,
				}),
			);
		}
		return new ImagesEmbed(images);
	}
}
