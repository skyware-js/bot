import type {} from "@atcute/atproto";
import type {} from "@atcute/bluesky";
import type {} from "@atcute/ozone";

import {
	Client,
	type ClientOptions,
	ClientResponseError,
	ok,
	type ProcedureRequestOptions,
	type QueryRequestOptions,
} from "@atcute/client";
import type { XRPCProcedures, XRPCQueries } from "@atcute/lexicons/ambient";
import type {
	InferOutput,
	XRPCLexBodyParam,
	XRPCProcedureMetadata,
	XRPCQueryMetadata,
} from "@atcute/lexicons/validations";
import type { ReadableStream } from "node:stream/web";
import { RateLimitThreshold } from "rate-limit-threshold";

const BSKY_LABELER = "did:plc:ar7c4by46qjdydhdevvrndac;redact";

/** Taken from @atcute/client */
type RequiredKeysOf<TType extends object> = TType extends any
	? Exclude<
		{ [Key in keyof TType]: TType extends Record<Key, TType[Key]> ? Key : never }[keyof TType],
		undefined
	>
	: never;

/** Taken from @atcute/client */
type HasRequiredKeys<TType extends object> = RequiredKeysOf<TType> extends never ? false : true;

/** Taken from @atcute/client */
export type ResponseFormat = "json" | "blob" | "bytes" | "stream";

/** Taken from @atcute/client */
export type FormattedResponse<TDef> = {
	json: TDef extends XRPCQueryMetadata<any, infer Body extends XRPCLexBodyParam, any>
		? InferOutput<Body["schema"]>
		: TDef extends XRPCProcedureMetadata<any, any, infer Body extends XRPCLexBodyParam, any>
			? InferOutput<Body["schema"]>
		: unknown;
	blob: Blob;
	bytes: Uint8Array;
	stream: ReadableStream<Uint8Array>;
};

type InternalRequestOptions = {
	signal?: AbortSignal;
	headers?: HeadersInit;
	as?: ResponseFormat | null;
	params?: Record<string, unknown>;
	input?: Record<string, unknown> | Blob;
};

/**
 * An XRPC agent with rate-limited requests.
 */
export class RateLimitedAgent<
	TQueries extends XRPCQueries = XRPCQueries,
	TProcedures extends XRPCProcedures = XRPCProcedures,
> {
	labelers = new Set([BSKY_LABELER]);

	client: Client;

	constructor(options: ClientOptions, private limiter: RateLimitThreshold) {
		this.client = new Client(options);
	}

	// @ts-expect-error — mysterious error
	get<TName extends keyof TQueries, TInit extends QueryRequestOptions<TQueries[TName]>>(
		name: TName,
		...options: HasRequiredKeys<TInit> extends true ? [init: TInit] : [init?: TInit]
	): Promise<
		TInit extends { as: infer TFormat }
			? TFormat extends ResponseFormat ? FormattedResponse<TQueries[TName]>[TFormat]
			: TFormat extends null ? null
			: never
			: TQueries[TName] extends
				XRPCQueryMetadata<any, infer Body extends XRPCLexBodyParam, any>
				? InferOutput<Body["schema"]>
			: never
	>;

	async get(name: string, options: InternalRequestOptions = {}) {
		(options ??= {}).headers = mergeHeaders(options.headers, {
			"atproto-accept-labelers": [...this.labelers].join(", "),
		});
		await this.limiter.limit();
		try {
			// @ts-expect-error — type parameters bad
			return await ok(this.client.get(name, options));
		} catch (e) {
			if (e instanceof ClientResponseError && e.status === 429) {
				const reset = parseInt(e.headers.get("ratelimit-reset") || "0");
				if (reset) {
					// Wait until the rate limit resets, plus half a second to be safe
					await RateLimitThreshold.sleep(reset * 1000 - Date.now() + 500);
					// @ts-expect-error — implementation signature doesn't match type
					return this.get(name, options);
				}
			}
			throw e;
		}
	}

	post<
		TName extends keyof TProcedures,
		TInit extends ProcedureRequestOptions<TProcedures[TName]>,
	>(
		name: TName,
		...options: HasRequiredKeys<TInit> extends true ? [init: TInit] : [init?: TInit]
	): Promise<
		TInit extends { as: infer TFormat }
			? TFormat extends ResponseFormat ? FormattedResponse<TProcedures[TName]>[TFormat]
			: TFormat extends null ? null
			: never
			: TProcedures[TName] extends
				XRPCProcedureMetadata<any, any, infer Body extends XRPCLexBodyParam, any>
				? InferOutput<Body["schema"]>
			: never
	>;

	async post(name: string, options: InternalRequestOptions = {}) {
		(options ??= {}).headers = mergeHeaders(options.headers, {
			"atproto-accept-labelers": [...this.labelers].join(", "),
		});
		await this.limiter.limit();
		try {
			// @ts-expect-error — type parameters bad
			return await ok(this.client.post(name, options));
		} catch (e) {
			if (e instanceof ClientResponseError && e.status === 429) {
				const reset = parseInt(e.headers.get("ratelimit-reset") || "0");
				if (reset) {
					// Wait until the rate limit resets, plus half a second to be safe
					await RateLimitThreshold.sleep(reset * 1000 - Date.now() + 500);
					// @ts-expect-error — implementation signature doesn't match type
					return this.post(name, options);
				}
			}
			throw e;
		}
	}

	/**
	 * Create a new agent with the atproto_proxy header set.
	 * @param did The proxy service DID.
	 * @param service The proxy service identifier.
	 */
	withProxy(did: `did:${string}:${string}`, service: `#${string}`): RateLimitedAgent {
		return new RateLimitedAgent({
			handler: this.client.handler,
			proxy: { did, serviceId: service },
		}, this.limiter);
	}
}

type HeadersInit = string[][] | Record<string, string | ReadonlyArray<string>> | Headers;
const mergeHeaders = (
	init: HeadersInit | undefined,
	defaults: Record<string, string | null>,
): HeadersInit => {
	let headers: Headers | undefined;

	for (const name in defaults) {
		const value = defaults[name];

		if (value !== null) {
			headers ??= new Headers(init);

			if (!headers.has(name)) {
				headers.set(name, value);
			}
		}
	}

	return headers ?? init ?? new Headers();
};
