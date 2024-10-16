const segmenter = new Intl.Segmenter();

/** Returns the number of graphemes in a given string. */
export function graphemeLength(text: string) {
	const iterator = segmenter.segment(text)[Symbol.iterator]();
	let count = 0;

	while (!iterator.next().done) {
		count++;
	}

	return count;
}
