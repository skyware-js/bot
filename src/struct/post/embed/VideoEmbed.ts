import type { AppBskyEmbedDefs, AppBskyEmbedVideo } from "@atproto/api";
import { PostEmbed } from "./PostEmbed.js";

/**
 * Data used to construct a VideoEmbed class.
 * @see VideoEmbed
 */
export interface VideoEmbedData {
	cid: string;
	playlist: string;
	thumbnail?: string | undefined;
	alt?: string | undefined;
	aspectRatio?: AppBskyEmbedDefs.AspectRatio | undefined;
	captions?: Array<AppBskyEmbedVideo.Caption> | undefined;
}

/**
 * A post embed that contains a video.
 */
export class VideoEmbed extends PostEmbed {
	/** The video's CID. */
	cid: string;

	/** A link to the [master playlist file](https://jazco.dev/2024/07/05/hls#master-playlists) for the video. */
	playlist: string;

	/** The video's thumbnail. */
	thumbnail?: string;

	/** The video's alt text. */
	alt?: string;

	/** The video's aspect ratio. */
	aspectRatio?: AppBskyEmbedDefs.AspectRatio;

	/** Any captions associated with the video. */
	captions?: Array<AppBskyEmbedVideo.Caption>;

	/**
	 * @param data Embed data.
	 */
	constructor({ cid, playlist, thumbnail, alt, aspectRatio, captions }: VideoEmbedData) {
		super();
		this.cid = cid;
		this.playlist = playlist;
		if (thumbnail) this.thumbnail = thumbnail;
		if (alt) this.alt = alt;
		if (aspectRatio) this.aspectRatio = aspectRatio;
		if (captions) this.captions = captions;
	}

	override isVideo(): this is VideoEmbed {
		return true;
	}

	/**
	 * Constructs a VideoEmbed from an embed view and a record.
	 * @param videoView The view of the embed.
	 * @param videoRecord The embed video record.
	 */
	static fromView(
		videoView: AppBskyEmbedVideo.View,
		videoRecord: AppBskyEmbedVideo.Main,
	): VideoEmbed {
		return new VideoEmbed({
			cid: videoView.cid,
			playlist: videoView.playlist,
			thumbnail: videoView.thumbnail,
			alt: videoView.alt,
			aspectRatio: videoView.aspectRatio,
			captions: videoRecord.captions,
		});
	}
}
