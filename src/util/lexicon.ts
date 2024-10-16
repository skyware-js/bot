import type { At, Brand, Records } from "@atcute/client/lexicons";

export function is<T extends keyof Records>(lexicon: T, obj: unknown): obj is Records[T];
export function is<T extends Brand.Union<{}>, const Type extends T["$type"]>(
	lexicon: Type,
	obj: T,
): obj is T & { $type: Type };
export function is<T, Type extends string>(
	lexicon: Type,
	obj: T,
): obj is T & { $type: Type | `${Type}#main` };
export function is(lexicon: string, obj: unknown): boolean {
	return typeof obj === "object" && obj !== null && "$type" in obj
		&& (obj.$type === lexicon || obj.$type === lexicon + "#main");
}

export const asDid = (did: string): At.DID => {
	if (!did.startsWith("did:")) throw new Error("Invalid DID: " + did);
	return did as At.DID;
};
