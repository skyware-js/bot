import { AppBskyFeedDefs, AppBskyRichtextFacet } from "@atproto/api";
import { Bot } from "../bot/Bot";
import { Profile } from "./Profile";

export interface FeedGeneratorData {
	displayName: string;
	uri: string;
	cid: string;
	did: string;
	creator: Profile;
	description?: string;
	descriptionFacets?: Array<AppBskyRichtextFacet.Main>;
	avatar?: string;
	indexedAt: Date;
}

export class FeedGenerator {
	/** The feed generator's name */
	displayName: string;

	/** The feed generator's AT URI */
	uri: string;

	/** The feed generator's CID */
	cid: string;

	/** The feed generator's DID */
	did: string;

	/** The feed generator's creator */
	creator: Profile;

	/** The feed generator's description */
	description?: string;

	/** Any facets associated with the feed generator's description */
	descriptionFacets?: Array<AppBskyRichtextFacet.Main>;

	/** The feed generator's avatar */
	avatar?: string;

	/** The time the feed generator was indexed by the App View */
	indexedAt: Date;

	constructor(
		{ displayName, uri, cid, did, creator, description, descriptionFacets, avatar, indexedAt }:
			FeedGeneratorData,
	) {
		this.displayName = displayName;
		this.uri = uri;
		this.cid = cid;
		this.did = did;
		this.creator = creator;
		if (description) this.description = description;
		if (descriptionFacets) this.descriptionFacets = descriptionFacets;
		if (avatar) this.avatar = avatar;
		this.indexedAt = indexedAt;
	}

	/**
	 * Constructs an instance from a GeneratorView
	 * @param view The GeneratorView to construct from
	 * @param bot The active Bot instance
	 */
	static fromView(view: AppBskyFeedDefs.GeneratorView, bot: Bot): FeedGenerator {
		return new FeedGenerator({
			...view,
			creator: Profile.fromView(view.creator, bot),
			indexedAt: new Date(view.indexedAt),
		});
	}
}
