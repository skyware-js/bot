import type { ComAtprotoLabelDefs } from "@atproto/api";
import { AppBskyActorDefs } from "@atproto/api";

export interface ProfileData {
	did: string;
	handle: string;
	displayName?: string | undefined;
	description?: string | undefined;
	avatar?: string | undefined;
	banner?: string | undefined;
	labels?: Array<ComAtprotoLabelDefs.Label> | undefined;
	indexedAt?: Date | undefined;
}

export class Profile {
	/** The user's DID */
	did: string;

	/** The user's handle */
	handle: string;

	/** The user's display name */
	displayName?: string;

	/** The user's profile description  */
	description?: string;

	/** The user's avatar URL */
	avatar?: string;

	/** The user's banner URL */
	banner?: string;

	/** Labels on the user's profile */
	labels: Array<ComAtprotoLabelDefs.Label>;

	/** The time when the user's profile was indexed by the App View */
	indexedAt?: Date;

	constructor(
		{ did, handle, displayName, description, avatar, banner, labels, indexedAt }: ProfileData,
	) {
		this.did = did;
		this.handle = handle;
		if (displayName) this.displayName = displayName;
		if (description) this.description = description;
		if (avatar) this.avatar = avatar;
		if (banner) this.banner = banner;
		this.labels = labels ?? [];
		if (indexedAt) this.indexedAt = indexedAt;
	}

	/**
	 * Constructs an instance from a ProfileView
	 * @param view The ProfileView to construct from
	 */
	static fromView(
		view: AppBskyActorDefs.ProfileView | AppBskyActorDefs.ProfileViewBasic,
	): Profile {
		return new Profile({
			...view,
			labels: view.labels ?? [],
			indexedAt: view.indexedAt && typeof view.indexedAt === "string"
				? new Date(view.indexedAt)
				: undefined,
		});
	}
}
