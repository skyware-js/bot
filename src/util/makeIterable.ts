type ArrayItem<R> = NonNullable<{
	[K in keyof R]: R[K] extends Array<infer U> ? U : never;
}[keyof R]>;

export function makeIterableWithCursorParameter<
	Rest extends unknown[],
	R extends { cursor?: string },
>(
	method: (cursor?: string | undefined, ...rest: Rest) => Promise<R>,
) {
	return async function* (initialCursor?: string | undefined, ...rest: Rest): AsyncIterableIterator<ArrayItem<R>> {
		let cursor = initialCursor;

		do {
			const page = await method(cursor, ...rest);

			const [_key, items] = (Object.entries(page).find(
				([key, value]) => key !== "cursor" && Array.isArray(value),
			) as [string, ArrayItem<R>[]] | undefined) ?? [];

			if (!items?.length) {
				throw new Error(
					"Couldn't find results array in response",
				);
			}

			for (const item of items) {
				yield item;
			}

			cursor = page.cursor;
		} while (cursor !== undefined);
	};
}

export function makeIterableWithCursorInOptions<
	LeadingArgs extends unknown[],
	Options extends { cursor?: string },
	R extends { cursor?: string | undefined },
>(
	method: (...args: [...LeadingArgs, Options]) => Promise<R>,
) {
	return async function* (..._args: [...LeadingArgs, Options]): AsyncIterableIterator<ArrayItem<R>> {
		const args = _args.slice(0, -1) as LeadingArgs;
		const options = (_args.length > 1 ? _args[_args.length - 1] : {}) as Options;
		let cursor = options.cursor;

		do {
			const page = await method(...args, { ...options, cursor });

			const [_key, items] = (Object.entries(page).find(
				([key, value]) => key !== "cursor" && Array.isArray(value),
			) as [string, ArrayItem<R>[]] | undefined) ?? [];

			if (!items?.length) {
				throw new Error(
					"Couldn't find results array in response",
				);
			}

			for (const item of items) {
				yield item;
			}

			cursor = page.cursor;
		} while (cursor !== undefined);
	};
}
