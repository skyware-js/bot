import type { AppBskyFeedDefs } from "@atcute/bluesky";
import type { Did, ResourceUri } from "@atcute/lexicons";
import type { ToolsOzoneModerationDefs } from "@atcute/ozone";
import type { Bot } from "../bot/Bot.js";
import { asDid, asUri } from "../util/lexicon.js";
import { makeIterableWithCursorInOptions } from "../util/makeIterable.js";
import { Facet } from "./post/Facet.js";
import { Post } from "./post/Post.js";
import { Profile } from "./Profile.js";

/**
 * Data used to construct a FeedGenerator class.
 * @see FeedGenerator
 */
export interface FeedGeneratorData {
	displayName: string;
	uri: string;
	cid: string;
	did: string;
	creator: Profile;
	description?: string | undefined;
	descriptionFacets?: Array<Facet> | undefined;
	avatar?: string | undefined;
	isOnline?: boolean;
	likeUri?: string;
	indexedAt: Date;
}

/**
 * A feed generator that can be followed to receive posts.
 */
export class FeedGenerator {
	/** The feed generator's name. */
	displayName: string;

	/** The feed generator's AT URI. */
	uri: ResourceUri;

	/** The feed generator's CID. */
	cid: string;

	/** The feed generator's DID. */
	did: Did;

	/** The feed generator's creator. */
	creator: Profile;

	/** The feed generator's description. */
	description?: string;

	/** Any facets associated with the feed generator's description. */
	descriptionFacets?: Array<Facet>;

	/** The feed generator's avatar. */
	avatar?: string;

	/** Whether the feed generator is currently online. */
	isOnline?: boolean;

	/** The URI of the feed generator's like record, if the viewer has liked the feed generator. */
	likeUri?: ResourceUri;

	/** The time the feed generator was indexed by the AppView. */
	indexedAt: Date;

	/**
	 * @param data Feed generator data.
	 * @param bot The active Bot instance.
	 */
	constructor(
		// dprint-ignore
		{ displayName, uri, cid, did, creator, description, descriptionFacets, avatar, isOnline, likeUri, indexedAt }:
			FeedGeneratorData,
		protected bot: Bot,
	) {
		this.displayName = displayName;
		this.uri = asUri(uri);
		this.cid = cid;
		this.did = asDid(did);
		this.creator = creator;
		if (description) this.description = description;
		if (descriptionFacets) this.descriptionFacets = descriptionFacets;
		if (avatar) this.avatar = avatar;
		if (isOnline != undefined) this.isOnline = isOnline;
		if (likeUri) this.likeUri = asUri(likeUri);
		this.indexedAt = indexedAt;
	}

	/**
	 * Like the feed generator.
	 * @returns The like record's AT URI.
	 */
	async like() {
		return this.likeUri = asUri((await this.bot.like({ uri: this.uri, cid: this.cid })).uri);
	}

	/**
	 * Unlike the feed generator.
	 */
	async unlike() {
		if (this.likeUri) await this.bot.unlike(this.likeUri);
		else {
			const { likeUri } = await this.bot.getFeedGenerator(this.uri, { skipCache: true });
			if (likeUri) await this.bot.unlike(likeUri);
		}
		delete this.likeUri;
	}

	/**
	 * Get a feed of posts from the feed generator.
	 * @param options Options for fetching the feed.
	 * @returns The posts and a cursor for pagination.
	 */
	async getPosts(
		{ limit = 100, cursor = "" }: FeedGeneratorGetPostsOptions = {},
	): Promise<{ cursor?: string; posts: Array<Post> }> {
		const response = await this.bot.agent.get("app.bsky.feed.getFeed", {
			params: { feed: this.uri, limit, cursor },
		}).catch((e) => {
			throw new Error("Failed to get feed for generator " + this.uri, { cause: e });
		});
		return {
			posts: response.feed.map(({ post }) => Post.fromView(post, this.bot)),
			...(response.cursor ? { cursor: response.cursor } : {}),
		};
	}

	/**
	 * Iterate over posts from this feed generator.
	 * @param options Options for fetching the feed.
	 */
	iteratePosts(options: FeedGeneratorGetPostsOptions = {}): AsyncIterableIterator<Post> {
		return makeIterableWithCursorInOptions(this.getPosts.bind(this))(options);
	}

	/**
	 * Apply labels to the feed geenrator.
	 * @param labels The labels to apply.
	 * @param comment An optional comment.
	 */
	async label(
		labels: Array<string>,
		comment?: string,
	): Promise<ToolsOzoneModerationDefs.ModEventView> {
		return this.bot.label({ reference: this, labels, comment });
	}

	/**
	 * Negate labels previously applied to the feed geenrator.
	 * @param labels The labels to negate.
	 * @param comment An optional comment.
	 */
	async negateLabels(
		labels: Array<string>,
		comment?: string,
	): Promise<ToolsOzoneModerationDefs.ModEventView> {
		return this.bot.negateLabels({ reference: this, labels, comment });
	}

	/**
	 * Constructs an instance from a GeneratorView.
	 * @param view The GeneratorView to construct from.
	 * @param bot The active Bot instance.
	 */
	static fromView(view: AppBskyFeedDefs.GeneratorView, bot: Bot): FeedGenerator {
		const { descriptionFacets, ...rest } = view;
		return new FeedGenerator({
			...rest,
			creator: Profile.fromView(view.creator, bot),
			indexedAt: new Date(view.indexedAt),
			descriptionFacets: descriptionFacets?.map((facet) =>
				new Facet(view.description!, facet)
			),
		}, bot);
	}
}

/**
 * Options for the {@link FeedGenerator#getPosts} method.
 */
export interface FeedGeneratorGetPostsOptions {
	/** The maximum number of posts to return (1-100, default 100). */
	limit?: number;
	/** The cursor for pagination. */
	cursor?: string;
}
