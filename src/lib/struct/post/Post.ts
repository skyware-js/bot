import type { Profile } from "../Profile";
import { PostPayload, type PostPayloadData } from "./PostPayload";

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

	constructor({ uri, cid, author, ...data }: PostData) {
		super(data);
		this.uri = uri;
		this.cid = cid;
		this.author = author;
	}
}
