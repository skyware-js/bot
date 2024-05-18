import { ChatBskyConvoDefs } from "@atproto/api";
import type { Bot } from "../../bot/Bot.js";

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

	/** The message's sender. */
	sender: { did: string };

	/** When the message was sent. */
	sentAt: Date;

	/**
	 * @param data Data used to construct the message.
	 * @param bot The active Bot instance.
	 */
	constructor({ id, sender, sentAt }: DeletedChatMessageData, protected bot: Bot) {
		this.id = id;
		this.sender = sender;
		this.sentAt = sentAt;
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
