import type { AppBskyRichtextFacet } from "@atproto/api";
import { utf8IndexToUtf16Index } from "../../richtext/detectFacets.js";

/**
 * A facet represents a span of text within a string with special meaning (e.g. mentions, links, tags).
 * @see https://docs.bsky.app/docs/advanced-guides/post-richtext#rich-text-facets
 */
export class Facet {
	/** The original text the facet is contained within. */
	sourceText: string;

	/** The range of bytes in the source text that this facet applies to, when the source text is encoded as UTF-8.
	 * Unless you know what you're doing, you should use the {@link index} property.
	 */
	byteIndex: {
		/** The index of the first byte included in the facet. */
		byteStart: number;
		/** The index of the first byte excluded from the facet. */
		byteEnd: number;
	};

	private _index?: { start: number; end: number };

	/** The decorations applied to the text within the facet range. */
	features: Array<FacetFeature>;

	/** The span of text this facet applies to. */
	get span() {
		return this.sourceText.slice(this.index.start, this.index.end);
	}

	/**
	 * The range of indices within the source text that this facet applies to.
	 * @property start The index of the first character included in the facet.
	 * @property end The index of the first character excluded from the facet.
	 */
	get index() {
		if (this._index) return this._index;
		return this._index = {
			start: utf8IndexToUtf16Index(this.sourceText, this.byteIndex.byteStart),
			end: utf8IndexToUtf16Index(this.sourceText, this.byteIndex.byteEnd),
		};
	}

	constructor(text: string, facet: AppBskyRichtextFacet.Main) {
		this.sourceText = text;
		this.byteIndex = { ...facet.index };
		this.features = facet.features.map((feature) => {
			if (typeof feature.did === "string") return new MentionFeature(feature.did);
			else if (typeof feature.uri === "string") return new LinkFeature(feature.uri);
			else if (typeof feature.tag === "string") return new TagFeature(feature.tag);
			else throw new Error("Unknown facet feature type " + feature.$type + ".");
		});
	}
}

/** Represents a specific decoration applied to a span of text. */
export class FacetFeature {
	isMention(): this is MentionFeature {
		return this.$type === "app.bsky.richtext.facet#mention";
	}

	isLink(): this is LinkFeature {
		return this.$type === "app.bsky.richtext.facet#link";
	}

	isTag(): this is TagFeature {
		return this.$type === "app.bsky.richtext.facet#tag";
	}

	constructor(/** The facet type. */ public $type: string) {}
}

/** Represents a user mention. */
export class MentionFeature extends FacetFeature {
	declare $type: "app.bsky.richtext.facet#mention";
	constructor(/** The mentioned user's DID. */ public did: string) {
		super("app.bsky.richtext.facet#mention");
	}
}

/** Represents a hyperlink. */
export class LinkFeature extends FacetFeature {
	declare $type: "app.bsky.richtext.facet#link";

	constructor(/** The referenced link. */ public uri: string) {
		super("app.bsky.richtext.facet#link");
	}
}

/** Represents an in-text hashtag. */
export class TagFeature extends FacetFeature {
	declare $type: "app.bsky.richtext.facet#tag";

	constructor(/** The hashtag, without the leading #. */ public tag: string) {
		super("app.bsky.richtext.facet#tag");
	}
}
