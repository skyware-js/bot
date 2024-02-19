import { AppBskyFeedDefs, AppBskyRichtextFacet } from "@atproto/api";
import { Bot } from "../bot/Bot";
import { Post } from "./post/Post";
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
	isOnline?: boolean;
	likeUri?: string;
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

	/** Whether the feed generator is currently online */
	isOnline?: boolean;

	/** The URI of the feed generator's like record, if the viewer has liked the feed generator */
	likeUri?: string;

	/** The time the feed generator was indexed by the App View */
	indexedAt: Date;

	constructor(
		// dprint-ignore
		{ displayName, uri, cid, did, creator, description, descriptionFacets, avatar, isOnline, likeUri, indexedAt }:
			FeedGeneratorData,
		/** The active Bot instance */
		public bot: Bot,
	) {
		this.displayName = displayName;
		this.uri = uri;
		this.cid = cid;
		this.did = did;
		this.creator = creator;
		if (description) this.description = description;
		if (descriptionFacets) this.descriptionFacets = descriptionFacets;
		if (avatar) this.avatar = avatar;
		if (isOnline != undefined) this.isOnline = isOnline;
		if (likeUri) this.likeUri = likeUri;
		this.indexedAt = indexedAt;
	}

	/**
	 * Like the feed generator
	 * @returns The like record's AT URI
	 */
	async like() {
		return this.likeUri = await this.bot.like({ uri: this.uri, cid: this.cid });
	}

	/**
	 * Unlike the feed generator
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
	 * Get a feed of posts from the feed generator
	 * @param limit The maximum number of posts to return (1-100, default 50)
	 * @param cursor The cursor for pagination
	 */
	async getPosts(
		{ limit = 50, cursor = "" } = {},
	): Promise<{ cursor: string | undefined; posts: Array<Post> }> {
		const response = await this.bot.api.app.bsky.feed.getFeed({
			feed: this.uri,
			limit,
			cursor,
		});
		if (!response.success) throw new Error("Failed to get feed for generator " + this.uri);
		return {
			cursor: response.data.cursor,
			posts: response.data.feed.map(({ post }) => Post.fromView(post, this.bot)),
		};
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
		}, bot);
	}
}
