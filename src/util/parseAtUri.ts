const ATP_URI_REGEX =
	// proto-    --did--------------   --name----------------   --path----   --query--   --hash--
	/^(at:\/\/)?((?:did:[a-z0-9:%-]+)|(?:[a-z0-9][a-z0-9.:-]*))(\/[^?#\s]*)?(\?[^#\s]+)?(#[^\s]+)?$/i;

export function parseAtUri(uri: string): { host: string; collection: string; rkey: string } {
	const match = uri.match(ATP_URI_REGEX);
	if (!match) throw new Error(`Invalid AT URI: ${uri}`);
	const [, _proto, host, pathname] = match;
	const [collection = "", rkey = ""] = pathname.split("/").filter(Boolean);
	return { host, collection, rkey };
}
