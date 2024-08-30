import {
	AppBskyActorDefs,
	type AppBskyGraphDefs,
	type AppBskyRichtextFacet,
	AtUri,
} from "@atproto/api";
import type { Bot } from "../bot/Bot.js";
import { Post } from "./post/Post.js";
import { Profile } from "./Profile.js";

/**
 * The purpose of a list.
 * @enum
 */
export const ListPurpose = {
	/** A moderation list. */
	ModList: "app.bsky.graph.defs#modlist",
	/** A user list. */
	CurateList: "app.bsky.graph.defs#curatelist",
};
export type ListPurpose = typeof ListPurpose[keyof typeof ListPurpose];

/**
 * Data used to construct a List class.
 */
export interface ListData {
	/** The list's name. */
	name: string;

	/** The list's AT URI. */
	uri: string;

	/** The list's CID. */
	cid: string;

	/** The list's purpose. */
	purpose: ListPurpose;

	/** The list's creator. */
	creator?: Profile | undefined;

	/** The list's description. */
	description?: string | undefined;

	/** Any facets associated with the list's description. */
	descriptionFacets?: Array<AppBskyRichtextFacet.Main> | undefined;

	/** The list's avatar. */
	avatar?: string | undefined;

	/** The list's members. */
	items?: Array<Profile>;

	/** The AT URI of the list block record, if the logged in user has the list blocked. */
	blockUri?: string | undefined;

	/** Whether the logged in user has the list muted. */
	muted?: boolean | undefined;

	/** The time the list was indexed by the AppView. */
	indexedAt?: Date | undefined;
}

/**
 * A list of users.
 */
export class List {
	/** The list's name. */
	name: string;

	/** The list's AT URI. */
	uri: string;

	/** The list's CID. */
	cid: string;

	/** The list's purpose. */
	purpose: ListPurpose;

	/** The list's creator. */
	creator?: Profile;

	/** The list's description. */
	description?: string;

	/** Any facets associated with the list's description. */
	descriptionFacets?: Array<AppBskyRichtextFacet.Main>;

	/** The list's avatar. */
	avatar?: string;

	/** The list's members. */
	items?: Array<Profile>;

	/** The AT URI of the list block record, if the bot has the list blocked. */
	blockUri?: string;

	/** Whether the bot has the list muted. */
	muted?: boolean;

	/** The time the list was indexed by the AppView. */
	indexedAt?: Date;

	/** Whether the list is a mod list. */
	get isModList(): boolean {
		return this.purpose === ListPurpose.ModList;
	}

	/** Whether the list is a curation list. */
	get isCurateList(): boolean {
		return this.purpose === ListPurpose.CurateList;
	}

	/**
	 * @param data List data.
	 * @param bot The active Bot instance.
	 */
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
		protected bot: Bot,
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
	 * Fetch the list's members.
	 * @param options Options for fetching list members.
	 */
	async fetchItems({ force = false }: ListFetchItemsOptions = {}): Promise<Array<Profile>> {
		if (!force && this.items) return this.items;
		const { items } = await this.bot.getList(this.uri);
		if (items) return this.items = items;
		return [];
	}

	/**
	 * Mute all accounts on the list.
	 */
	async mute(): Promise<void> {
		await this.bot.agent.app.bsky.graph.muteActorList({ list: this.uri }).catch((e) => {
			throw new Error(`Failed to mute list ${this.uri}`, { cause: e });
		});
	}

	/**
	 * Unmute all accounts on the list.
	 */
	async unmute(): Promise<void> {
		await this.bot.agent.app.bsky.graph.unmuteActorList({ list: this.uri }).catch((e) => {
			throw new Error(`Failed to unmute list ${this.uri}`, { cause: e });
		});
	}

	/**
	 * Block all accounts on the list.
	 * @returns The AT URI of the list block record.
	 */
	async block(): Promise<string> {
		const block = await this.bot.agent.app.bsky.graph.listblock.create({
			repo: this.bot.profile.did,
		}, { subject: this.uri, createdAt: new Date().toISOString() }).catch((e) => {
			throw new Error("Failed to block list " + this.uri, { cause: e });
		});
		this.blockUri = block.uri;
		return this.blockUri;
	}

	/**
	 * Unblock all accounts on the list.
	 */
	async unblock(): Promise<void> {
		if (this.blockUri) {
			const { host: repo, rkey } = new AtUri(this.blockUri);
			await this.bot.agent.app.bsky.graph.listblock.delete({ repo, rkey }, {}).catch((e) => {
				throw new Error("Failed to unblock list " + this.uri, { cause: e });
			});
		}
	}

	/**
	 * Get a feed of recent posts from accounts on the list.
	 * @param options Options for fetching the feed.
	 */
	async getFeed(
		{ limit = 100, cursor = "" }: ListGetFeedOptions = {},
	): Promise<{ cursor: string | undefined; posts: Array<Post> }> {
		const response = await this.bot.agent.app.bsky.feed.getListFeed({
			list: this.uri,
			limit,
			cursor,
		}).catch((e) => {
			throw new Error("Failed to get feed for list " + this.uri, { cause: e });
		});
		return {
			cursor: response.data.cursor,
			posts: response.data.feed.map(({ post }) => Post.fromView(post, this.bot)),
		};
	}

	/**
	 * Apply labels to the list.
	 * @param labels The labels to apply.
	 * @param comment An optional comment.
	 */
	async label(labels: Array<string>, comment?: string) {
		return this.bot.label({ reference: this, labels, comment });
	}

	/**
	 * Negate labels previously applied to the list.
	 * @param labels The labels to negate.
	 * @param comment An optional comment.
	 */
	async negateLabels(labels: Array<string>, comment?: string) {
		return this.bot.negateLabels({ reference: this, labels, comment });
	}

	/**
	 * Constructs an instance from a ListView.
	 * @param view The ListView to construct from.
	 * @param bot The active Bot instance.
	 */
	static fromView(
		view: AppBskyGraphDefs.ListView | AppBskyGraphDefs.ListViewBasic,
		bot: Bot,
	): List {
		return new List({
			...view,
			creator: AppBskyActorDefs.isProfileView(view.creator)
				? Profile.fromView(view.creator, bot)
				: undefined,
			blockUri: view.viewer?.blocked,
			muted: view.viewer?.muted,
			indexedAt: view.indexedAt ? new Date(view.indexedAt) : undefined,
		}, bot);
	}
}

/**
 * Options for the {@link List#fetchItems} method.
 */
export interface ListFetchItemsOptions {
	/** Whether to fetch items even if they are already cached. */
	force?: boolean;
}

/**
 * Options for the {@link List#getFeed} method.
 */
export interface ListGetFeedOptions {
	/** The maximum number of posts to fetch (1-100, default 100). */
	limit?: number;
	/** The cursor for pagination. */
	cursor?: string;
}
