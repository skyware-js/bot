import { AppBskyRichtextFacet } from "@atproto/api";
import { ListView } from "@atproto/api/dist/client/types/app/bsky/graph/defs";
import { Profile } from "./Profile";

export const ListPurpose = {
	ModList: "app.bsky.graph.defs#modlist",
	CurateList: "app.bsky.graph.defs#curatelist",
};
export type ListPurpose = typeof ListPurpose[keyof typeof ListPurpose];

export interface ListData {
	name: string;
	uri: string;
	cid: string;
	creator: Profile;
	purpose: ListPurpose;
	description?: string;
	descriptionFacets?: Array<AppBskyRichtextFacet.Main>;
	avatar?: string;
	indexedAt: Date;
}

export class List {
	/** The list's name */
	name: string;

	/** The list's AT URI */
	uri: string;

	/** The list's CID */
	cid: string;

	/** The list's creator */
	creator: Profile;

	/** The list's purpose */
	purpose: ListPurpose;

	/** The list's description */
	description?: string;

	/** Any facets associated with the list's description */
	descriptionFacets?: Array<AppBskyRichtextFacet.Main>;

	/** The list's avatar */
	avatar?: string;

	/** The time the list was indexed by the App View */
	indexedAt: Date;

	constructor(
		{ name, uri, cid, creator, purpose, description, descriptionFacets, avatar, indexedAt }:
			ListData,
	) {
		this.name = name;
		this.uri = uri;
		this.cid = cid;
		this.creator = creator;
		this.purpose = purpose;
		if (description) this.description = description;
		if (descriptionFacets) this.descriptionFacets = descriptionFacets;
		if (avatar) this.avatar = avatar;
		this.indexedAt = indexedAt;
	}

	/**
	 * Constructs an instance from a ListView
	 * @param view The ListView to construct from
	 */
	static fromView(view: ListView): List {
		return new List({
			...view,
			creator: Profile.fromView(view.creator),
			indexedAt: new Date(view.indexedAt),
		});
	}
}
