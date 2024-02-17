/**
 * Object.keys() but typed. Don't use unless it is guaranteed that there are no extraneous properties.
 */
export function typedKeys<T extends object>(obj: T): T extends T ? Array<keyof T> : never {
	return Object.keys(obj) as never;
}

/**
 * Object.entries() but typed. Don't use unless it is guaranteed that there are no extraneous properties.
 */
export function typedEntries<T extends object>(
	obj: T,
): T extends T ? Array<{ [K in keyof T]: [K, T[K]] }[keyof T]> : never {
	return Object.entries(obj) as never;
}
