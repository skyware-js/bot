import type { AppBskyEmbedImages } from "@atproto/api";

export interface ImageData {
	cid: string;
	alt?: string;
	mimeType: string;
	size: number;
	aspectRatio?: AppBskyEmbedImages.AspectRatio;
	thumb?: string;
	fullsize?: string;
}

/**
 * Represents an image embedded in a post
 */
export class EmbedImage {
	/** The image's CID */
	cid: string;

	/** The image's alt text */
	alt: string;

	/** The image's MIME type */
	mimeType: string;

	/** Image size in bytes */
	size: number;

	/** The image's aspect ratio */
	aspectRatio?: AppBskyEmbedImages.AspectRatio;

	/** The URL of the image's thumbnail located at the Bluesky CDN */
	private _thumbUrl?: string;

	/** The URL of the full-size image located at the Bluesky CDN */
	private _fullsizeUrl?: string;

	constructor({ cid, alt = "", mimeType, size, aspectRatio, thumb, fullsize }: ImageData) {
		this.cid = cid;
		this.alt = alt;
		this.mimeType = mimeType;
		this.size = size;
		if (aspectRatio) this.aspectRatio = aspectRatio;
		if (thumb) this._thumbUrl = thumb;
		if (fullsize) this._fullsizeUrl = fullsize;
	}

	/**
	 * Get the URL of the image's thumbnail
	 */
	get thumbnailUrl(): string | undefined {
		return this._thumbUrl;
	}

	/**
	 * Get the URL of the full-size image
	 */
	get url(): string | undefined {
		return this._fullsizeUrl;
	}
}
