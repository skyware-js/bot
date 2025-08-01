import type { ChatBskyConvoDefs } from "@atcute/bluesky";
import type { Bot } from "../../bot/Bot.js";
import { BaseChatMessage, type BaseChatMessageData } from "./BaseChatMessage.js";

/**
 * Data used to construct a DeletedChatMessage class.
 * @see DeletedChatMessage
 */
export interface DeletedChatMessageData extends BaseChatMessageData {}

/**
 * Represents a deleted message in a chat conversation.
 */
export class DeletedChatMessage extends BaseChatMessage {
	/**
	 * Constructs an instance from a DeletedMessageView.
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
