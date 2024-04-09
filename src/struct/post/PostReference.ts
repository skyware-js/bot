import type { Bot, BotPostOptions, StrongRef } from "../../bot/Bot.js";
import type { Post } from "./Post.js";
import type { PostPayload, ReplyRef } from "./PostPayload.js";

/**
 * Data used to construct a PostReference class.
 * @see PostReference
 */
export interface PostReferenceData {
	uri: string;
	cid: string;
	replyRef?: ReplyRef | undefined;
}

/**
 * A reference to a post.
 */
export class PostReference implements StrongRef {
	/** The post's AT URI. */
	uri: string;

	/** The post's CID. */
	cid: string;

	/** A reference to the post's parent and root post. */
	replyRef?: ReplyRef;

	/**
	 * @param data Data used to construct the reference.
	 * @param bot The active Bot instance.
	 */
	constructor({ uri, cid, replyRef }: PostReferenceData, protected bot: Bot) {
		this.uri = uri;
		this.cid = cid;
		if (replyRef) {
			this.replyRef = { parent: { uri: replyRef.parent.uri, cid: replyRef.parent.cid } };
			if (replyRef.root) {
				this.replyRef.root = { uri: replyRef.root.uri, cid: replyRef.root.cid };
			}
		}
	}

	/**
	 * Fetch the full referenced post.
	 */
	async fetch(): Promise<Post> {
		return this.bot.getPost(this.uri);
	}

	/**
	 * Reply to the post.
	 * @param payload The post payload.
	 * @param options Optional configuration.
	 * @returns A reference to the created post.
	 */
	async reply(payload: PostPayload, options: BotPostOptions = {}): Promise<PostReference> {
		return this.bot.post({
			...payload,
			replyRef: {
				parent: { uri: this.uri, cid: this.cid },
				root: this.replyRef?.root ?? { uri: this.uri, cid: this.cid },
			},
		}, options);
	}

	/**
	 * Create a new post with this post quoted.
	 * @param payload The post payload.
	 * @param options Optional configuration.
	 * @returns A reference to the created post.
	 */
	async quote(payload: PostPayload, options: BotPostOptions = {}): Promise<PostReference> {
		return this.bot.post({ ...payload, quoted: this }, options);
	}

	/**
	 * Like the post.
	 */
	async like() {
		return this.bot.like(this);
	}

	/**
	 * Unlike the post.
	 */
	async unlike() {
		return this.bot.unlike(this.uri);
	}

	/**
	 * Repost the post.
	 */
	async repost() {
		return this.bot.repost(this);
	}

	/**
	 * If this post has been reposted, delete the repost.
	 */
	async deleteRepost() {
		return this.bot.deleteRepost(this.uri);
	}

	/**
	 * Delete the post.
	 */
	async delete() {
		return this.bot.deletePost(this.uri);
	}
}
