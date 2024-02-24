import { AppBskyGraphDefs, type AppBskyRichtextFacet } from "@atproto/api";
import type { Bot } from "../bot/Bot";
import { Post } from "./post/Post";
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
	items?: Array<Profile>;
	blockUri?: string | undefined;
	muted?: boolean | undefined;
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

	/** The list's members */
	items?: Array<Profile>;

	/** The AT URI of the list block record, if the bot has the list blocked */
	blockUri?: string;

	/** Whether the bot has the list muted */
	muted?: boolean;

	/** The time the list was indexed by the App View */
	indexedAt?: Date;

	/** Whether the list is a mod list */
	get isModList(): boolean {
		return this.purpose === ListPurpose.ModList;
	}

	/** Whether the list is a curate list */
	get isCurateList(): boolean {
		return this.purpose === ListPurpose.CurateList;
	}

	constructor(
		{
			name,
			uri,
			cid,
			creator,
			purpose,
			description,
			descriptionFacets,
			avatar,
			items,
			indexedAt,
		}: ListData,
		/** The active Bot instance */
		public bot: Bot,
	) {
		this.name = name;
		this.uri = uri;
		this.cid = cid;
		this.purpose = purpose;
		if (creator) this.creator = creator;
		if (description) this.description = description;
		if (descriptionFacets) this.descriptionFacets = descriptionFacets;
		if (avatar) this.avatar = avatar;
		if (items) this.items = items;
		if (indexedAt) this.indexedAt = indexedAt;
	}

	/**
	 * Fetch the list's members
	 * @param force Whether to fetch items even if they are already cached
	 */
	async fetchItems({ force = false } = {}): Promise<Array<Profile>> {
		if (!force && this.items) return this.items;
		const { items } = await this.bot.getList(this.uri);
		if (items) return this.items = items;
		return [];
	}

	/**
	 * Mute all accounts on the list
	 */
	async mute(): Promise<void> {
		const response = await this.bot.api.app.bsky.graph.muteActorList({ list: this.uri });
		if (!response.success) throw new Error("Failed to mute list " + this.uri);
	}

	/**
	 * Unmute all accounts on the list
	 */
	async unmute(): Promise<void> {
		const response = await this.bot.api.app.bsky.graph.unmuteActorList({ list: this.uri });
		if (!response.success) throw new Error("Failed to unmute list " + this.uri);
	}

	/**
	 * Block all accounts on the list
	 * @returns The AT URI of the list block record
	 */
	async block(): Promise<string> {
		const { uri } = await this.bot.api.app.bsky.graph.block.create({
			repo: this.bot.profile.did,
		}, { subject: this.uri, createdAt: new Date().toISOString() }).catch((e) => {
			throw new Error("Failed to block list " + this.uri + "\n" + e);
		});
		this.blockUri = uri;
		return uri;
	}

	/**
	 * Unblock all accounts on the list
	 */
	async unblock(): Promise<void> {
		if (this.blockUri) {
			await this.bot.api.app.bsky.graph.block.delete({ uri: this.blockUri }).catch((e) => {
				throw new Error("Failed to unblock list " + this.uri + "\n" + e);
			});
		}
	}

	/**
	 * Get a feed of recent posts from accounts on the list
	 * @param limit The maximum number of posts to fetch (1-100, default 50)
	 * @param cursor The cursor for pagination
	 */
	async getFeed(
		{ limit = 50, cursor = "" } = {},
	): Promise<{ cursor: string | undefined; posts: Array<Post> }> {
		const response = await this.bot.api.app.bsky.feed.getListFeed({
			list: this.uri,
			limit,
			cursor,
		});
		if (!response.success) throw new Error("Failed to get feed for list " + this.uri);
		return {
			cursor: response.data.cursor,
			posts: response.data.feed.map(({ post }) => Post.fromView(post, this.bot)),
		};
	}

	/**
	 * Constructs an instance from a ListView
	 * @param view The ListView to construct from
	 * @param bot The active Bot instance
	 */
	static fromView(
		view: AppBskyGraphDefs.ListView | AppBskyGraphDefs.ListViewBasic,
		bot: Bot,
	): List {
		return new List({
			...view,
			creator: AppBskyGraphDefs.isListView(view)
				? Profile.fromView(view.creator, bot)
				: undefined,
			blockUri: view.viewer?.blocked,
			muted: view.viewer?.muted,
			indexedAt: view.indexedAt ? new Date(view.indexedAt) : undefined,
		}, bot);
	}
}
