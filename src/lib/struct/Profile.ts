import { BlobRef, ComAtprotoLabelDefs } from "@atproto/api";
import { Bot } from "../Bot";

export interface ProfileData {
	did: string;
	handle?: string;
	displayName?: string;
	description?: string;
	avatar?: BlobRef;
	banner?: BlobRef;
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
	handle?: string;

	/**
	 * The user's display name
	 */
	displayName?: string;

	/**
	 * The user's profile description
	 */
	description?: string;

	/**
	 * The user's avatar as a BlobRef
	 */
	avatar?: BlobRef;

	/**
	 * The user's banner as a BlobRef
	 */
	banner?: BlobRef;

	/**
	 * Labels on the user's profile
	 */
	labels: Array<ComAtprotoLabelDefs.Label>;

	constructor(
		{ did, handle, displayName, description, avatar, banner, labels }: ProfileData,
		public bot?: Bot,
	) {
		this.did = did;
		if (handle) this.handle = handle;
		if (displayName) this.displayName = displayName;
		if (description) this.description = description;
		if (avatar) {
			this.avatar = new BlobRef(avatar.ref, avatar.mimeType, avatar.size, avatar.original);
		}
		if (banner) {
			this.banner = new BlobRef(banner.ref, banner.mimeType, banner.size, banner.original);
		}
		this.labels = labels ?? [];
	}

	/**
	 * Returns the user's avatar URL
	 */
	get avatarUrl() {
		if (!this.avatar) return null;
		return `https://cdn.bsky.app/img/avatar/plain/${this.did}/${this.avatar.ref}@jpeg`;
	}

	/**
	 * Returns the user's banner URL
	 */
	get bannerUrl() {
		if (!this.banner) return null;
		return `https://cdn.bsky.app/img/banner/plain/${this.did}/${this.banner.ref}@jpeg`;
	}

	/**
	 * Resolves the user's handle and sets the handle property
	 */
	async resolveHandle() {
		if (this.handle) return this.handle;
		if (!this.bot) return null;
		const repo = await this.bot.agent.com.atproto.repo.describeRepo({ repo: this.did });
		if (!repo.success || !repo.data.handle || !repo.data.handleIsCorrect) return null;
		this.handle = repo.data.handle;
		return this.handle;
	}
}
