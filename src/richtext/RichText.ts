// Copyright (c) 2024 Mary <mary.my.id>
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { AppBskyRichtextFacet } from "@atproto/api";
import type { Bot } from "../bot/Bot.js";
import { detectFacets } from "./detectFacets.js";

type FacetFeature = AppBskyRichtextFacet.Main["features"][number];

const segmenter = new Intl.Segmenter();

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Returns the number of graphemes in a given string. */
export function graphemeLength(text: string) {
	const iterator = segmenter.segment(text)[Symbol.iterator]();
	let count = 0;

	while (!iterator.next().done) {
		count++;
	}

	return count;
}

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
	const buf = new Uint8Array(a.length + b.length);
	buf.set(a, 0);
	buf.set(b, a.length);

	return buf;
};

const facetSort = (a: AppBskyRichtextFacet.Main, b: AppBskyRichtextFacet.Main) =>
	a.index.byteStart - b.index.byteStart;

/**
 * Used to build a rich text string with facets.
 * @see https://docs.bsky.app/docs/advanced-guides/post-richtext
 */
export class RichText {
	private buffer = new Uint8Array(0);
	private facets: Array<AppBskyRichtextFacet.Main> = [];

	/**
	 * Completes the rich text string and returns the result, with parsed facets
	 * and the length of the string in graphemes.
	 */
	build(): { text: string; facets: Array<AppBskyRichtextFacet.Main>; length: number } {
		const text = decoder.decode(this.buffer);
		return { text: text, facets: this.facets, length: graphemeLength(text) };
	}

	private feature(substr: string, feature: FacetFeature): this {
		const start = this.buffer.length;
		const end = this.text(substr).buffer.length;

		this.facets.push({ index: { byteStart: start, byteEnd: end }, features: [feature] });

		return this;
	}

	/** Append a string. */
	text(substr: string): this {
		this.buffer = concat(this.buffer, encoder.encode(substr));
		return this;
	}

	/** Append a mention. */
	mention(handle: string, did: string): this {
		return this.feature(handle, { $type: "app.bsky.richtext.facet#mention", did });
	}

	/**
	 * Append a link.
	 * You can use the `uri` parameter to specify a different URI than the `substr`.
	 * @example Create a hyperlink
	 * ```ts
	 * new RichText().text("Go to ").link("https://bsky.app").build();
	 * ```
	 * @example Create a hyperlink with custom text
	 * ```ts
	 * new RichText().text("Go to ").link("Bluesky", "https://bsky.app").build();
	 * ```
	 */
	link(substr: string, uri: string = substr): this {
		return this.feature(substr, { $type: "app.bsky.richtext.facet#link", uri });
	}

	/** Append a tag. */
	tag(tag: string): this {
		if (tag.startsWith("#")) tag = tag.slice(1);
		return this.feature(`#${tag}`, { $type: "app.bsky.richtext.facet#tag", tag });
	}

	/**
	 * Returns a RichText instance with all facets (mentions, links, tags, etc) resolved.
	 * @param text The text to detect facets in.
	 * @param bot Used to resolve mentions to DIDs.
	 */
	static async detectFacets(text: string, bot: Bot) {
		const facets = RichText.detectFacetsWithoutResolution(text);
		for (const facet of facets) {
			for (const feature of facet.features) {
				if (AppBskyRichtextFacet.isMention(feature)) {
					const did = await bot.resolveHandle(feature.did).catch((_: unknown) =>
						undefined
					);
					if (!did) {
						// Remove facet if mention could not be resolved
						facet.features.splice(facet.features.indexOf(feature), 1);
						if (facet.features.length === 0) {
							facets.splice(facets.indexOf(facet), 1);
						}
					} else {
						feature.did = did;
					}
				}
			}
		}
		return facets;
	}

	/**
	 * Detects rich text facets in a string (mentions, links, tags, etc).
	 * Will produce invalid facets! For instance, mentions will not have their DIDs set.
	 * Use {@link detectFacets} to produce valid facets that can be attached to a post.
	 */
	static detectFacetsWithoutResolution = (text: string): Array<AppBskyRichtextFacet.Main> => {
		return (detectFacets(text) || []).sort(facetSort);
	};
}
