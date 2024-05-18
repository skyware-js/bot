import { type ChatBskyConvoDefs } from "@atproto/api";
import type { Bot } from "../../bot/Bot.js";
import type { Profile } from "../Profile.js";

/**
 * Data used to construct a DeletedChatMessage class.
 * @see DeletedChatMessage
 */
export interface DeletedChatMessageData {
	id: string;
	sender: { did: string };
	sentAt: Date;
}

/**
 * Represents a deleted message in a chat conversation.
 */
export class DeletedChatMessage {
	/** The message's ID. */
	id: string;

	/** The DID of the message's sender. */
	senderDid: string;

	/** When the message was sent. */
	sentAt: Date;

	/** The profile of the user who sent the message. */
	private sender?: Profile;

	/**
	 * @param data Data used to construct the message.
	 * @param bot The active Bot instance.
	 */
	constructor({ id, sender, sentAt }: DeletedChatMessageData, protected bot: Bot) {
		this.id = id;
		this.senderDid = sender.did;
		this.sentAt = sentAt;
	}

	/**
	 * Fetch the profile of the user who sent this message.
	 */
	async getSender(): Promise<Profile> {
		if (this.sender) return this.sender;
		if (this.senderDid === this.bot.profile.did) return this.bot.profile;
		return this.sender = await this.bot.getProfile(this.senderDid);
	}

	/**
	 * Constructs an instance from a MessageView.
	 */
	static fromView(view: ChatBskyConvoDefs.DeletedMessageView, bot: Bot): DeletedChatMessage {
		const message = new DeletedChatMessage({
			id: view.id,
			sender: view.sender,
			sentAt: new Date(view.sentAt),
		}, bot);
		return message;
	}
}
