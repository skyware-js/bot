import {
	XRPC,
	XRPCError,
	type XRPCOptions,
	type XRPCRequestOptions,
	type XRPCResponse,
} from "@atcute/client";
import { mergeHeaders } from "@atcute/client/utils/http";
import { RateLimitThreshold } from "rate-limit-threshold";

const BSKY_LABELER = "did:plc:ar7c4by46qjdydhdevvrndac;redact";

/**
 * An XRPC agent with rate-limited requests.
 */
export class RateLimitedAgent extends XRPC {
	labelers = new Set([BSKY_LABELER]);

	constructor(options: XRPCOptions, private limiter: RateLimitThreshold) {
		super(options);
	}

	override async request(options: XRPCRequestOptions): Promise<XRPCResponse> {
		options.headers = mergeHeaders(options.headers, {
			"atproto-accept-labelers": [...this.labelers].join(", "),
		});
		await this.limiter.limit();

		try {
			return super.request(options);
		} catch (e) {
			if (e instanceof XRPCError && e.status === 429 && e.kind === "RateLimitExceeded") {
				const reset = parseInt(e.headers["rate-limit-reset"] || "0");
				if (reset) {
					// Wait until the rate limit resets, plus half a second to be safe
					await RateLimitThreshold.sleep(reset * 1000 - Date.now() + 500);
					return super.request(options);
				}
			}
			throw e;
		}
	}

	/**
	 * Create a new agent with the atproto_proxy header set.
	 * @param type The proxy type.
	 * @param service The proxy service.
	 */
	withProxy(type: string, service: `did:${string}`): RateLimitedAgent {
		const agent = new RateLimitedAgent(
			{ handler: undefined!, proxy: { type, service } },
			this.limiter,
		);
		agent.handle = this.handle;
		return agent;
	}
}
