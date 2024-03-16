// Copyright (c) 2024 Bluesky PBC
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

import type { AppBskyRichtextFacet } from "@atproto/api";

export type Facet = AppBskyRichtextFacet.Main;

const MENTION_REGEX = /(^|\s|\()(@)([a-zA-Z0-9.-]+)(\b)/g;
const URL_REGEX = /(^|\s|\()((https?:\/\/[\S]+)|((?<domain>[a-z][a-z0-9]*(\.[a-z0-9]+)+)[\S]*))/gim;
const TRAILING_PUNCTUATION_REGEX = /\p{P}+$/gu;
/**
 * `\ufe0f` emoji modifier
 * `\u00AD\u2060\u200A\u200B\u200C\u200D\u20e2` zero-width spaces (likely incomplete)
 */
const TAG_REGEX =
	/(^|\s)[#＃]((?!\ufe0f)[^\s\u00AD\u2060\u200A\u200B\u200C\u200D\u20e2]*[^\d\s\p{P}\u00AD\u2060\u200A\u200B\u200C\u200D\u20e2]+[^\s\u00AD\u2060\u200A\u200B\u200C\u200D\u20e2]*)?/gu;

const encoder = new TextEncoder();

const utf16IndexToUtf8Index = (text: string, i: number) => {
	return encoder.encode(text.slice(0, i)).byteLength;
};

/**
 * This is a vendored version of the @atproto/api detectFacets method that doesn't use the UnicodeString class.
 * This allows us to avoid importing `graphemer`, instead using `Intl.Segmenter` (see {@link graphemeLength}), saving ~800kB in bundle size.
 *
 * JS strings are UTF-16 by default; `utf16IndexToUtf8Index` is used to get UTF-8 byte indices of facets within text.
 * @param text Text to detect facets in.
 */
export function detectFacets(text: string): Array<Facet> | undefined {
	let match;
	const facets: Array<Facet> = [];
	{
		// mentions
		const re = MENTION_REGEX;
		while ((match = re.exec(text))) {
			const did = match[3];
			if (!did.startsWith("did:")) continue;
			const start = text.indexOf(match[3], match.index) - 1;
			facets.push({
				index: {
					byteStart: utf16IndexToUtf8Index(text, start),
					byteEnd: utf16IndexToUtf8Index(text, start + match[3].length + 1),
				},
				features: [{
					$type: "app.bsky.richtext.facet#mention",
					did, // must be resolved afterwards
				}],
			});
		}
	}
	{
		// links
		const re = URL_REGEX;
		while ((match = re.exec(text))) {
			let uri = match[2];
			if (!uri.startsWith("http")) {
				const domain = match.groups?.domain;
				if (!domain) {
					continue;
				}
				uri = `https://${uri}`;
			}
			const start = text.indexOf(match[2], match.index);
			const index = { start, end: start + match[2].length };
			// strip ending puncuation
			if (/[.,;:!?]$/.test(uri)) {
				uri = uri.slice(0, -1);
				index.end--;
			}
			if (/[)]$/.test(uri) && !uri.includes("(")) {
				uri = uri.slice(0, -1);
				index.end--;
			}
			facets.push({
				index: {
					byteStart: utf16IndexToUtf8Index(text, index.start),
					byteEnd: utf16IndexToUtf8Index(text, index.end),
				},
				features: [{ $type: "app.bsky.richtext.facet#link", uri }],
			});
		}
	}
	{
		const re = TAG_REGEX;
		while ((match = re.exec(text))) {
			let tag = match[2];

			if (!tag) continue;

			// strip ending punctuation and any spaces
			tag = tag.trim().replace(TRAILING_PUNCTUATION_REGEX, "");

			if (tag.length === 0 || tag.length > 64) continue;

			const index = match.index + match[1].length;

			facets.push({
				index: {
					byteStart: utf16IndexToUtf8Index(text, index),
					byteEnd: utf16IndexToUtf8Index(text, index + 1 + tag.length),
				},
				features: [{ $type: "app.bsky.richtext.facet#tag", tag: tag }],
			});
		}
	}
	return facets.length > 0 ? facets : undefined;
}
