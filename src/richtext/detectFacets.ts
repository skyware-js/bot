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
const decoder = new TextDecoder();

export const utf16IndexToUtf8Index = (text: string, i: number) => {
	return encoder.encode(text.slice(0, i)).byteLength;
};
export const utf8IndexToUtf16Index = (text: string, i: number) => {
	return decoder.decode(encoder.encode(text).slice(0, i + 1)).length - 1;
};

/**
 * This is a modified version of the {@link import("@atproto/api").RichText#detectFacets} function that doesn't use the UnicodeString class.
 * This allows us to avoid importing `graphemer`, instead using the `Intl.Segmenter` builtin (see {@link graphemeLength}), which saves ~800kB in bundle size (200kB gzipped).
 *
 * JS strings are encoded as UTF-16; `utf16IndexToUtf8Index` is used to get UTF-8 byte indices of facets within text.
 * @param text Text to detect facets in.
 */
export function detectFacets(text: string): Array<AppBskyRichtextFacet.Main> | undefined {
	let match;
	const facets: Array<AppBskyRichtextFacet.Main> = [];
	{
		// mentions
		const re = MENTION_REGEX;
		while ((match = re.exec(text))) {
			const mention = match[3];
			if (!mention.includes(".")) continue;

			const start = text.indexOf(mention, match.index) - 1;
			facets.push({
				index: {
					byteStart: utf16IndexToUtf8Index(text, start),
					byteEnd: utf16IndexToUtf8Index(text, start + mention.length + 1),
				},
				features: [{
					$type: "app.bsky.richtext.facet#mention",
					did: mention, // must be resolved afterwards
				}],
			});
		}
		re.lastIndex = 0;
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
		re.lastIndex = 0;
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
		re.lastIndex = 0;
	}
	return facets.length > 0 ? facets : undefined;
}
