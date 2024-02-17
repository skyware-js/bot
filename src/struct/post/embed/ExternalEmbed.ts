import { PostEmbed } from "./PostEmbed";

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

	constructor({ uri, title, description, thumb }: ExternalEmbed) {
		super();
		this.uri = uri;
		this.title = title;
		this.description = description;
		if (thumb) this.thumb = thumb;
	}

	override isExternal(): this is ExternalEmbed {
		return true;
	}
}
