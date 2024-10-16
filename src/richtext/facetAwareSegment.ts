import type { AppBskyRichtextFacet } from "@atcute/client/lexicons";
import { utf16IndexToUtf8Index } from "./detectFacets.js";

const segmenter = new Intl.Segmenter();

/**
 * Segment a string into substrings of a given grapheme length, without breaking facets.
 * @param text The string to segment.
 * @param length The maximum grapheme length of each segment.
 * @param facets The facets to avoid breaking.
 * @returns An array of substrings and their associated facets.
 */
export function facetAwareSegment(
	text: string,
	length: number,
	facets: Array<AppBskyRichtextFacet.Main>,
): Array<{ text: string; facets: Array<AppBskyRichtextFacet.Main> }> {
	// The text segmented into graphemes
	const segments = [...segmenter.segment(text)];

	// The substrings to return and their facets
	const substrings: Array<{ text: string; facets: Array<AppBskyRichtextFacet.Main> }> = [];
	// The graphemes in the current substring
	let currentSubstring: Array<Intl.SegmentData> = [];

	// Keep track of the number of bytes behind the current substring so we can calculate facet indices accurately
	let byteOffset = 0;

	for (let i = 0; i < segments.length; i++) {
		currentSubstring.push(segments[i]);

		// If we've reached the maximum limit
		if (currentSubstring.length >= length) {
			// We want to check if splitting here would break a facet
			let lastSegment = currentSubstring[currentSubstring.length - 1];
			let currentGraphemeUtf8Index = lastSegment
				? utf16IndexToUtf8Index(text, lastSegment.index)
				: -1; // If there are no segments in the current substring, the while loop will never run

			// Check if there's a facet whose byte range contains the last grapheme in the current substring
			const facetBeingBroken = facets.find((facet) =>
				facet.index.byteStart < currentGraphemeUtf8Index
				&& currentGraphemeUtf8Index < facet.index.byteEnd
			);

			// Backtrack until we're no longer within the byte range of the facet
			while (
				currentGraphemeUtf8Index >= (facetBeingBroken?.index.byteStart ?? Infinity)
				&& currentSubstring.length > 1
			) {
				currentSubstring.pop();
				i--;
				lastSegment = currentSubstring[currentSubstring.length - 1];
				currentGraphemeUtf8Index = utf16IndexToUtf8Index(text, lastSegment.index);
			}

			// We can now safely push the current substring
			const substring = currentSubstring.map((s) => s.segment).join("");

			// Alongside it, we include the facets that are contained within the substring
			const substringFacets = facets.reduce<Array<AppBskyRichtextFacet.Main>>(
				(acc, facet) => {
					const { byteStart, byteEnd } = facet.index;
					if (
						byteStart >= utf16IndexToUtf8Index(text, currentSubstring[0].index)
						&& byteEnd <= utf16IndexToUtf8Index(text, lastSegment.index) + 1 // byteEnd is exclusive, so if it's at the end of a string, it will be 1 greater than the last index
					) {
						acc.push({
							...facet,
							index: {
								byteStart: byteStart - byteOffset,
								byteEnd: byteEnd - byteOffset,
							},
						});
					}
					return acc;
				},
				[],
			);

			substrings.push({ text: substring, facets: substringFacets });
			currentSubstring = [];

			byteOffset = currentGraphemeUtf8Index + 1;
		}
	}

	// Push the remaining substring
	const substring = currentSubstring.map((s) => s.segment).join("");
	const substringFacets = facets.reduce<Array<AppBskyRichtextFacet.Main>>((acc, facet) => {
		const { byteStart, byteEnd } = facet.index;
		if (
			byteStart >= utf16IndexToUtf8Index(text, currentSubstring[0].index)
			&& byteEnd
				<= utf16IndexToUtf8Index(text, currentSubstring[currentSubstring.length - 1].index)
					+ 1 // byteEnd is exclusive, so if it's at the end of a string, it will be 1 greater than the last index
		) {
			acc.push({
				...facet,
				index: { byteStart: byteStart - byteOffset, byteEnd: byteEnd - byteOffset },
			});
		}
		return acc;
	}, []);
	substrings.push({ text: substring, facets: substringFacets });

	return substrings;
}
