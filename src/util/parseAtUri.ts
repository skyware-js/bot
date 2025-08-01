import { parseCanonicalResourceUri } from "@atcute/lexicons";

export function parseAtUri(uri: string) {
	const res = parseCanonicalResourceUri(uri);
	if (!res.ok) throw new Error(`Invalid AT URI: ${uri}`);
	return res.value;
}
