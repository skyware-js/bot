import { AtUri } from "@atproto/api";
import { Bot } from "../../Bot";
import { Profile } from "../Profile";
import { PostPayload, PostPayloadData } from "./PostPayload";

/**
 * Data that can be used to construct a Post class
 */
export type PostData = PostPayloadData & { uri: string; cid: string; author: Profile };

/**
 * Represents a post on Bluesky
 */
export class Post extends PostPayload {
	/**
	 * The post's AT URI
	 */
	uri: string;

	/**
	 * The post's CID
	 */
	cid: string;

	/**
	 * The post's author
	 */
	author: Profile;

	constructor({ uri, cid, author, ...data }: PostData, public bot?: Bot) {
		super(data);
		this.uri = uri;
		this.cid = cid;
		this.author = author;
	}

	static async fromUri(uri: string, bot: Bot): Promise<Post> {
		const { host: repo, rkey } = new AtUri(uri);
		const post = await bot.agent.getPost({ repo, rkey });
		return new Post({
			...post.value,
			createdAt: new Date(post.value.createdAt),
			uri: post.uri,
			cid: post.cid,
			author: await Profile.fromDid(repo, bot),
		}, bot);
	}
}
