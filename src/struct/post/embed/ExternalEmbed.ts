import type { AppBskyEmbedExternal } from "@atproto/api";
import { PostEmbed } from "./PostEmbed.js";

interface ExternalEmbedData {
	uri: string;
	title: string;
	description: string;
	thumb?: string;
}

/**
 * A post embed that links to external content
 */
export class ExternalEmbed extends PostEmbed {
	/** The URI of the external content */
	uri: string;

	/** The title of the embed */
	title: string;

	/** The description of the embed */
	description: string;

	/** The URL for the embed's thumbnail */
	thumb?: string;

	constructor({ uri, title, description, thumb }: ExternalEmbedData) {
		super();
		this.uri = uri;
		this.title = title;
		this.description = description;
		if (thumb) this.thumb = thumb;
	}

	override isExternal(): this is ExternalEmbed {
		return true;
	}

	/**
	 * Constructs an ExternalEmbed from an embed view
	 * @param externalView The view of the embed
	 */
	static fromView(externalView: AppBskyEmbedExternal.View): ExternalEmbed {
		return new ExternalEmbed(externalView.external);
	}
}
