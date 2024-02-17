import {
	type AtpAgentLoginOpts,
	type AtpAgentOpts,
	type AtpSessionData,
	BskyAgent,
	type ComAtprotoServerCreateSession,
	type ComAtprotoServerGetSession,
	RichText,
} from "@atproto/api";
import { Post } from "./struct/post/Post";
import { PostPayload, PostPayloadData } from "./struct/post/PostPayload";
import { Profile } from "./struct/Profile";

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
 * Options for the Bot#post method
 */
type BotPostOptions = {
	/**
	 * Whether to automatically resolve facets in the post's text
	 * This will be ignored if the provided post data already has facets attached
	 * @default true
	 */
	resolveFacets?: boolean;
};

/**
 * A bot that can interact with the Bluesky API
 */
export class Bot {
	/**
	 * The agent used to communicate with the Bluesky API
	 */
	agent: BskyAgent;

	/**
	 * The default list of languages to attach to posts
	 */
	langs: Array<string> = [];

	/**
	 * The bot account's Bluesky profile
	 */
	profile!: Profile;

	constructor({ langs, ...options }: BotOptions = {}) {
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
		let response;

		if ("accessJwt" in options && "refreshJwt" in options) {
			// Try resuming if session data is provided
			const resumeSessionResponse = await this.agent.resumeSession(options);
			if (!resumeSessionResponse.success) {
				throw new Error(
					"Provided session data is invalid, try logging in with identifier & password instead.",
				);
			}

			response = resumeSessionResponse.data;
		} else if ("identifier" in options && "password" in options) {
			// Try logging in with identifier & password
			if (options.identifier[0] === "@") {
				options.identifier = options.identifier.slice(1);
			}

			const loginResponse = await this.agent.login(options);
			if (!loginResponse.success) {
				throw new Error("Failed to log in — double check your credentials and try again.");
			}

			response = loginResponse.data;
		}

		if (!response) {
			throw new Error(
				"Invalid login options. You must provide either session data or an identifier & password.",
			);
		}

		this.profile = await Profile.fromDid(response.did, this).catch((e) => {
			throw new Error("Failed to fetch bot profile. Error:\n" + e);
		});

		return response;
	}

	/**
	 * Create a post
	 * @param data The post to create
	 * @param options Optional configuration
	 */
	async post(
		data: PostPayloadData,
		options: BotPostOptions = { resolveFacets: true },
	): Promise<{ uri: string; cid: string }> {
		const post = new PostPayload(data);
		if (!post.langs?.length) post.langs = [...this.langs];

		const richText = new RichText({ text: post.text, facets: post.facets ?? [] });
		if (options.resolveFacets && !post.facets?.length) {
			await richText.detectFacets(this.agent);
		}

		const { uri, cid } = await this.agent.post({
			...post,
			createdAt: post.createdAt.toISOString(),
			text: richText.text,
			facets: richText.facets ?? [],
		});
		return new Post({ ...data, uri, cid, author: this.profile }, this);
	}
}

await new Bot().post({ text: "Hello world" }, {});
