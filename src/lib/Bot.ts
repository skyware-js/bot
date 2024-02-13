import {
	type AtpAgentLoginOpts,
	type AtpAgentOpts,
	type AtpSessionData,
	BskyAgent,
	type ComAtprotoServerCreateSession,
	type ComAtprotoServerGetSession,
} from "@atproto/api";

/**
 * Options for the Bot constructor
 */
interface BotOptions extends Partial<AtpAgentOpts> {
	/**
	 * The default list of languages to attach to posts
	 */
	langs?: Array<string>;
}

/**
 * A bot that can interact with the Bluesky API
 */
export class Bot {
	/**
	 * The agent used to communicate with the Bluesky API
	 */
	agent: BskyAgent;

	langs: Array<string> = [];

	constructor({ langs, ...options }: BotOptions) {
		this.agent = new BskyAgent({ service: "https://bsky.social", ...options });

		if (langs) this.langs = langs;
	}

	/**
	 * Log in with an identifier and password
	 * @param identifier The bot account's email, handle, or DID
	 * @param password The bot account's password
	 */
	async login(
		{ identifier, password }: AtpAgentLoginOpts,
	): Promise<ComAtprotoServerCreateSession.OutputSchema>;
	/**
	 * Log in with an existing session
	 * @param session Must have a valid refreshJwt and accessJwt
	 */
	async login(session: AtpSessionData): Promise<ComAtprotoServerGetSession.OutputSchema>;
	async login(
		options: AtpAgentLoginOpts | AtpSessionData,
	): Promise<
		ComAtprotoServerGetSession.OutputSchema | ComAtprotoServerCreateSession.OutputSchema
	> {
		if ("accessJwt" in options && "refreshJwt" in options) {
			// Try resuming if session data is provided
			const resumeSessionResponse = await this.agent.resumeSession(options);
			if (!resumeSessionResponse.success) {
				throw new Error(
					"Provided session data is invalid, try logging in with identifier & password instead.",
				);
			}
			return resumeSessionResponse.data;
		} else if ("identifier" in options && "password" in options) {
			// Try logging in with identifier & password
			if (options.identifier[0] === "@") {
				options.identifier = options.identifier.slice(1);
			}

			const loginResponse = await this.agent.login(options);
			if (!loginResponse.success) {
				throw new Error("Failed to log in — double check your credentials and try again.");
			}
			return loginResponse.data;
		} else {
			throw new Error(
				"Invalid login options. You must provide either session data or an identifier & password.",
			);
		}
	}
}
