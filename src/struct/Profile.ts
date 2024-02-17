import type { ComAtprotoLabelDefs } from "@atproto/api";

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

	constructor({ did, handle, displayName, description, avatar, banner, labels }: ProfileData) {
		this.did = did;
		this.handle = handle;
		if (displayName) this.displayName = displayName;
		if (description) this.description = description;
		if (avatar) this.avatar = avatar;
		if (banner) this.banner = banner;
		this.labels = labels ?? [];
	}
}
