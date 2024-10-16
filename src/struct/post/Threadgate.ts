import type { AppBskyFeedDefs, At, Brand } from "@atcute/client/lexicons";
import type { Bot } from "../../bot/Bot.js";
import { is } from "../../util/lexicon.js";
import { List } from "../List.js";
import type { Post } from "./Post.js";

/**
 * Data used to construct a Threadgate class.
 * @see Threadgate
 */
export interface ThreadgateData {
	cid: string;
	uri: string;
	createdAt: Date;
	post: Post;
	allowsFollowing?: boolean | undefined;
	allowsMentioned?: boolean | undefined;
	allowedLists?: Array<List> | undefined;
}

/**
 * A threadgate limits who can reply to a post.
 */
export class Threadgate {
	/** The threadgate's CID. */
	cid: At.CID;

	/** The threadgate's AT URI. */
	uri: At.Uri;

	/** When the threadgate was created. */
	createdAt: Date;

	/** The post this threadgate is attached to. */
	post: Post;

	/** Whether users followed by the threadgate author are allowed to reply. */
	allowsFollowing: boolean;

	/** Whether users mentioned in the post are allowed to reply. */
	allowsMentioned: boolean;

	/** Lists whose members are allowed to reply. */
	allowedLists: Array<List>;

	/**
	 * @param data Threadgate data.
	 */
	constructor(
		{
			cid,
			uri,
			createdAt,
			post,
			allowsFollowing = false,
			allowsMentioned = false,
			allowedLists = [],
		}: ThreadgateData,
	) {
		this.cid = cid;
		this.uri = uri;
		this.createdAt = createdAt;
		this.post = post;
		this.allowsFollowing = allowsFollowing;
		this.allowsMentioned = allowsMentioned;
		this.allowedLists = allowedLists;
	}

	/** Whether the threadgate allows replies based on user lists. */
	get allowsListMembers(): boolean {
		return this.allowedLists.length > 0;
	}

	/**
	 * Constructs an instance from a ThreadgateView.
	 */
	static fromView(
		view: Brand.Omit<AppBskyFeedDefs.ThreadgateView>,
		post: Post,
		bot: Bot,
	): Threadgate {
		if (!is("app.bsky.feed.threadgate", view.record) || !view.cid || !view.uri) {
			throw new Error("Invalid threadgate view");
		}

		let allowsFollowing = false, allowsMentioned = false;
		for (const rule of view.record.allow ?? []) {
			if (rule.$type === "app.bsky.feed.threadgate#followingRule") {
				allowsFollowing = true;
			} else if (rule.$type === "app.bsky.feed.threadgate#mentionRule") {
				allowsMentioned = true;
			}
		}

		return new Threadgate({
			cid: view.cid,
			uri: view.uri,
			createdAt: new Date(view.record.createdAt),
			post,
			allowsFollowing,
			allowsMentioned,
			allowedLists: view.lists?.map((list) => List.fromView(list, bot)) ?? [],
		});
	}
}
