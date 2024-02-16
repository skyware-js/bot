import { ComAtprotoLabelDefs } from "@atproto/api";
import { Bot } from "../Bot";

export interface ProfileData {
	did: string;
	handle: string;
	displayName?: string;
	description?: string;
	avatar?: string;
	banner?: string;
	labels?: Array<ComAtprotoLabelDefs.Label>;
}

export class Profile {
	/**
	 * The user's DID
	 */
	did: string;

	/**
	 * The user's handle
	 */
	handle: string;

	/**
	 * The user's display name
	 */
	displayName?: string;

	/**
	 * The user's profile description
	 */
	description?: string;

	/**
	 * The user's avatar URL
	 */
	avatar?: string;

	/**
	 * The user's banner URL
	 */
	banner?: string;

	/**
	 * Labels on the user's profile
	 */
	labels: Array<ComAtprotoLabelDefs.Label>;

	constructor(
		{ did, handle, displayName, description, avatar, banner, labels }: ProfileData,
		public bot?: Bot,
	) {
		this.did = did;
		this.handle = handle;
		if (displayName) this.displayName = displayName;
		if (description) this.description = description;
		if (avatar) this.avatar = avatar;
		if (banner) this.banner = banner;
		this.labels = labels ?? [];
	}

	/**
	 * Fetches a user's profile from their DID
	 * @param did The user's DID
	 * @param bot The Bot instance to use for the request
	 */
	static async fromDid(did: string, bot: Bot): Promise<Profile> {
		const profile = await bot.agent.getProfile({ actor: did });
		if (!profile.success) {
			throw new Error(`Failed to fetch profile ${did}\n` + JSON.stringify(profile.data));
		}
		return new Profile(profile.data, bot);
	}
}
