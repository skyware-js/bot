import type { ComAtprotoLabelDefs } from "@atproto/api";
import { AppBskyActorDefs } from "@atproto/api";
import {
	Bot,
	BotGetUserLikesOptions,
	BotGetUserListsOptions,
	BotGetUserPostsOptions,
} from "../bot/Bot";
import { List } from "./List";
import { Post } from "./post/Post";

export interface ProfileData {
	did: string;
	handle: string;
	displayName?: string | undefined;
	description?: string | undefined;
	avatar?: string | undefined;
	banner?: string | undefined;
	followerCount?: number | undefined;
	followingCount?: number | undefined;
	postsCount?: number | undefined;
	labels?: Array<ComAtprotoLabelDefs.Label> | undefined;
	indexedAt?: Date | undefined;
	followUri?: string | undefined;
	followedByUri?: string | undefined;
	isMuted?: boolean | undefined;
	blockUri?: string | undefined;
	isBlockedBy?: boolean | undefined;
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

	/** The number of followers the user has */
	followerCount?: number;

	/** The number of users the user is following */
	followingCount?: number;

	/** The number of posts the user has made */
	postsCount?: number;

	/** Labels on the user's profile */
	labels: Array<ComAtprotoLabelDefs.Label>;

	/** The time when the user's profile was indexed by the App View */
	indexedAt?: Date;

	/**
	 * The AT URI of the follow relationship between the bot and the user.
	 * Undefined if the bot is not following the user.
	 */
	followUri?: string;

	/**
	 * The AT URI of the follow relationship between the bot and the user.
	 * Undefined if the user is not following the bot.
	 */
	followedByUri?: string;

	/** Whether the user is muted by the bot */
	isMuted?: boolean;

	/**
	 * The AT URI of the block relationship between the bot and the user.
	 * Undefined if the user is not blocking the bot.
	 */
	blockUri?: string;

	/** Whether the bot is blocked by the user */
	isBlockedBy?: boolean;

	/** Whether the bot is following the user */
	get isFollowing() {
		return this.followUri != undefined;
	}

	/** Whether the user is following the bot */
	get isFollowedBy() {
		return this.followedByUri != undefined;
	}

	/** Whether the bot is blocking the user */
	get isBlocking() {
		return this.blockUri != undefined;
	}

	/** Whether the user is being followed and is following the bot */
	get isMutual() {
		return this.isFollowing && this.isFollowedBy;
	}

	constructor(
		// dprint-ignore
		{ did, handle, displayName, description, avatar, banner, followerCount, followingCount, postsCount, labels, indexedAt, followUri, followedByUri, isMuted, blockUri, isBlockedBy }: ProfileData,
		/** The active Bot instance */
		public bot: Bot,
	) {
		this.did = did;
		this.handle = handle;
		if (displayName) this.displayName = displayName;
		if (description) this.description = description;
		if (avatar) this.avatar = avatar;
		if (banner) this.banner = banner;
		if (followerCount != undefined) this.followerCount = followerCount;
		if (followingCount != undefined) this.followingCount = followingCount;
		if (postsCount != undefined) this.postsCount = postsCount;
		this.labels = labels ?? [];
		if (indexedAt) this.indexedAt = indexedAt;
		if (followUri != undefined) this.followUri = followUri;
		if (followedByUri != undefined) this.followedByUri = followedByUri;
		if (isMuted != undefined) this.isMuted = isMuted;
		if (blockUri != undefined) this.blockUri = blockUri;
		if (isBlockedBy != undefined) this.isBlockedBy = isBlockedBy;
	}

	/**
	 * Follow the user
	 * @returns The AT URI of the follow relationship
	 */
	async follow(): Promise<string> {
		return this.followUri = await this.bot.follow(this.did);
	}

	/**
	 * Unfollow the user
	 */
	async unfollow(): Promise<void> {
		return this.bot.unfollow(this.did);
	}

	/**
	 * Mute the user
	 */
	async mute(): Promise<void> {
		return this.bot.mute(this.did);
	}

	/**
	 * Unmute the user
	 */
	async unmute(): Promise<void> {
		return this.bot.unmute(this.did);
	}

	/**
	 * Block the user
	 * @returns The AT URI of the block relationship
	 */
	async block(): Promise<string> {
		return this.blockUri = await this.bot.block(this.did);
	}

	/**
	 * Unblock the user
	 */
	async unblock(): Promise<void> {
		return this.bot.deleteBlock(this.did);
	}

	/**
	 * Fetch the user's posts (up to 100 at a time, default 50)
	 * @param options Optional configuration
	 * @returns The user's posts and a cursor for pagination
	 */
	async getPosts(
		options?: BotGetUserPostsOptions,
	): Promise<{ cursor: string | undefined; posts: Array<Post> }> {
		return this.bot.getUserPosts(this.did, options ?? {});
	}

	/**
	 * Fetch the user's liked posts (up to 100 at a time, default 50)
	 * @param options Optional configuration
	 * @returns The user's liked posts and a cursor for pagination
	 */
	async getLikedPosts(
		options?: BotGetUserLikesOptions,
	): Promise<{ cursor: string | undefined; posts: Array<Post> }> {
		return this.bot.getUserLikes(this.did, options ?? {});
	}

	/**
	 * Fetch the user's lists (up to 100 at a time, default 50)
	 * @param options Optional configuration
	 * @returns The user's lists and a cursor for pagination
	 */
	async getLists(
		options: BotGetUserListsOptions,
	): Promise<{ cursor: string | undefined; lists: Array<List> }> {
		return this.bot.getUserLists(this.did, options);
	}

	/**
	 * Constructs an instance from a ProfileView
	 * @param view The ProfileView to construct from
	 * @param bot The active Bot instance
	 */
	static fromView(
		view: AppBskyActorDefs.ProfileView | AppBskyActorDefs.ProfileViewBasic,
		bot: Bot,
	): Profile {
		return new Profile({
			...view,
			labels: view.labels ?? [],
			indexedAt: view.indexedAt && typeof view.indexedAt === "string"
				? new Date(view.indexedAt)
				: undefined,
			followerCount: typeof view.followersCount === "number"
				? view.followersCount
				: undefined,
			followingCount: typeof view.followsCount === "number" ? view.followsCount : undefined,
			postsCount: typeof view.postsCount === "number" ? view.postsCount : undefined,
			followUri: view.viewer?.following,
			followedByUri: view.viewer?.followedBy,
			isMuted: view.viewer?.muted,
			blockUri: view.viewer?.blocking,
			isBlockedBy: view.viewer?.blockedBy,
		}, bot);
	}
}
