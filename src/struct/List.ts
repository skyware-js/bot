import { AppBskyGraphDefs, AppBskyRichtextFacet } from "@atproto/api";
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
	purpose: ListPurpose;
	creator?: Profile | undefined;
	description?: string | undefined;
	descriptionFacets?: Array<AppBskyRichtextFacet.Main> | undefined;
	avatar?: string | undefined;
	indexedAt?: Date | undefined;
}

export class List {
	/** The list's name */
	name: string;

	/** The list's AT URI */
	uri: string;

	/** The list's CID */
	cid: string;

	/** The list's purpose */
	purpose: ListPurpose;

	/** The list's creator */
	creator?: Profile;

	/** The list's description */
	description?: string;

	/** Any facets associated with the list's description */
	descriptionFacets?: Array<AppBskyRichtextFacet.Main>;

	/** The list's avatar */
	avatar?: string;

	/** The time the list was indexed by the App View */
	indexedAt?: Date;

	constructor(
		{ name, uri, cid, creator, purpose, description, descriptionFacets, avatar, indexedAt }:
			ListData,
	) {
		this.name = name;
		this.uri = uri;
		this.cid = cid;
		this.purpose = purpose;
		if (creator) this.creator = creator;
		if (description) this.description = description;
		if (descriptionFacets) this.descriptionFacets = descriptionFacets;
		if (avatar) this.avatar = avatar;
		if (indexedAt) this.indexedAt = indexedAt;
	}

	/**
	 * Constructs an instance from a ListView
	 * @param view The ListView to construct from
	 */
	static fromView(view: AppBskyGraphDefs.ListView | AppBskyGraphDefs.ListViewBasic): List {
		return new List({
			...view,
			creator: AppBskyGraphDefs.isListView(view) ? Profile.fromView(view.creator) : undefined,
			indexedAt: view.indexedAt ? new Date(view.indexedAt) : undefined,
		});
	}
}
