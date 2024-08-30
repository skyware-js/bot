import {
	AppBskyGraphDefs,
	AppBskyGraphStarterpack,
	type AppBskyRichtextFacet,
	type ComAtprotoLabelDefs,
} from "@atproto/api";
import type { BaseBotGetMethodOptions, Bot } from "../bot/Bot.js";
import { FeedGenerator } from "./FeedGenerator.js";
import { List } from "./List.js";
import { Profile } from "./Profile.js";

/**
 * Data used to construct a StarterPack class.
 */
export interface StarterPackData {
	/** The starter pack's name. */
	name: string;

	/** The starter pack's AT URI. */
	uri: string;

	/** The starter pack's CID. */
	cid: string;

	/** The starter pack's description. */
	description?: string | undefined;

	/** Any facets associated with the starter pack's description. */
	descriptionFacets?: Array<AppBskyRichtextFacet.Main> | undefined;

	/** The starter pack's creator. */
	creator: Profile;

	/** The user list associated with the starter pack. */
	userList?: List | undefined;

	/** The starter pack's user list's AT URI. */
	userListUri: string;

	/** Feeds associated with the starter pack. */
	feeds?: Array<FeedGenerator> | undefined;

	/** The starter pack's feeds' AT URIs. */
	feedUris?: Array<string> | undefined;

	/** The number of users who joined using the starter pack in the past week. */
	joinedWeekCount?: number | undefined;

	/** The number of users who joined using the starter pack in all time. */
	joinedAllTimeCount?: number | undefined;

	/** When the starter pack was indexed by the AppView. */
	indexedAt: Date;

	/** Any labels on the starter pack record. */
	labels?: Array<ComAtprotoLabelDefs.Label> | undefined;
}

/**
 * A Bluesky starter pack.
 */
export class StarterPack {
	/** The starter pack's name. */
	name: string;

	/** The starter pack's AT URI. */
	uri: string;

	/** The starter pack's CID. */
	cid: string;

	/** The starter pack's description. */
	description?: string;

	/** Any facets associated with the starter pack's description. */
	descriptionFacets?: Array<AppBskyRichtextFacet.Main>;

	/** The starter pack's creator. */
	creator: Profile;

	/** The user list associated with the starter pack. */
	userList?: List;

	/** The starter pack's user list's AT URI. */
	private userListUri: string;

	/** Feeds associated with the starter pack. */
	feeds?: Array<FeedGenerator>;

	/** The starter pack's feeds' AT URIs. */
	private feedUris?: Array<string>;

	/** The number of users who joined using the starter pack in the past week. */
	joinedWeekCount?: number;

	/** The number of users who joined using the starter pack in all time. */
	joinedAllTimeCount?: number;

	/** When the starter pack was indexed by the AppView. */
	indexedAt: Date;

	/** Any labels on the starter pack record. */
	labels?: Array<ComAtprotoLabelDefs.Label>;

	/**
	 * @param data Starter pack data.
	 * @param bot The active Bot instance.
	 */
	constructor(
		{
			name,
			uri,
			cid,
			description,
			creator,
			descriptionFacets,
			userList,
			userListUri,
			feeds,
			feedUris,
			joinedWeekCount,
			joinedAllTimeCount,
			indexedAt,
			labels,
		}: StarterPackData,
		protected bot: Bot,
	) {
		this.name = name;
		this.uri = uri;
		this.cid = cid;
		if (description) this.description = description;
		if (descriptionFacets) this.descriptionFacets = descriptionFacets;
		this.creator = creator;
		if (userList) this.userList = userList;
		this.userListUri = userListUri;
		if (feeds) this.feeds = feeds;
		if (feedUris) this.feedUris = feedUris;
		if (joinedWeekCount) this.joinedWeekCount = joinedWeekCount;
		if (joinedAllTimeCount) this.joinedAllTimeCount = joinedAllTimeCount;
		this.indexedAt = indexedAt;
		if (labels) this.labels = labels;
	}

	/**
	 * Fetches the user list associated with the starter pack.
	 * @param options The fetch options.
	 * @returns The user list.
	 */
	async fetchList(
		{ force = false, ...options }: StarterPackFetchListOptions = {},
	): Promise<List> {
		if (!force && this.userList) return this.userList;
		if (!this.userListUri) throw new Error("No user list URI");
		return this.userList = await this.bot.getList(this.userListUri, options);
	}

	/**
	 * Fetches the feeds associated with the starter pack.
	 * @param options The fetch options.
	 * @returns The feeds.
	 */
	async fetchFeeds(
		{ force = false, ...options }: StarterPackFetchFeedsOptions = {},
	): Promise<Array<FeedGenerator>> {
		if (!force && this.feeds) return this.feeds;
		if (!this.feedUris?.length) return this.feeds = [];
		return this.feeds = await Promise.all(
			this.feedUris.map((uri) => this.bot.getFeedGenerator(uri, options)),
		);
	}

	/**
	 * Constructs an instance from a StarterPackView.
	 * @param view The StarterPackView to construct from.
	 * @param bot The active Bot instance.
	 */
	static fromView(
		view: AppBskyGraphDefs.StarterPackView | AppBskyGraphDefs.StarterPackViewBasic,
		bot: Bot,
	): StarterPack {
		if (!AppBskyGraphStarterpack.isRecord(view.record) || !view.cid || !view.uri) {
			throw new Error("Invalid starter pack view");
		}

		let userList: List | undefined,
			feeds: Array<FeedGenerator> | undefined,
			joinedWeekCount: number | undefined,
			joinedAllTimeCount: number | undefined;
		if (AppBskyGraphDefs.isStarterPackView(view)) {
			if (view.list) userList = List.fromView(view.list, bot);
			if (view.feeds) feeds = view.feeds.map((feed) => FeedGenerator.fromView(feed, bot));
			joinedWeekCount = view.joinedWeekCount;
			joinedAllTimeCount = view.joinedAllTimeCount;
		}

		return new StarterPack({
			name: view.record.name,
			uri: view.uri,
			cid: view.cid,
			description: view.record.description,
			descriptionFacets: view.record.descriptionFacets,
			creator: Profile.fromView(view.creator, bot),
			userList,
			userListUri: view.record.list,
			feeds,
			feedUris: view.record.feeds?.map((feed) => feed.uri) ?? [],
			joinedWeekCount,
			joinedAllTimeCount,
			indexedAt: new Date(view.indexedAt),
			labels: view.labels,
		}, bot);
	}
}

/**
 * Options for the {@link StarterPack#fetchList} method.
 */
export interface StarterPackFetchListOptions extends BaseBotGetMethodOptions {
	/** Whether to fetch items even if they are already cached. */
	force?: boolean;
}

/**
 * Options for the {@link StarterPack#fetchFeeds} method.
 */
export interface StarterPackFetchFeedsOptions extends BaseBotGetMethodOptions {
	/** Whether to fetch items even if they are already cached. */
	force?: boolean;
}
