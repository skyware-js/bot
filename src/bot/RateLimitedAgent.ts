import { AtpAgent, type AtpAgentOptions } from "@atproto/api";
import type { RateLimitThreshold } from "rate-limit-threshold";

export class RateLimitedAgent extends AtpAgent {
	constructor(options: AtpAgentOptions, private limiter: RateLimitThreshold) {
		super({
			...options,
			fetch: async (...args) => {
				await this.limiter.limit();
				return fetch(...args);
			},
		});
	}
}
