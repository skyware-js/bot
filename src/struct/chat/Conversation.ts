import type { ChatBskyConvoDefs } from "@atcute/client/lexicons";
import type { Bot, BotSendMessageOptions } from "../../bot/Bot.js";
import { Profile } from "../Profile.js";
import { type ChatMessage, type ChatMessagePayload } from "./ChatMessage.js";
import { type DeletedChatMessage } from "./DeletedChatMessage.js";

/**
 * Data used to construct a Conversation class.
 * @see Conversation
 */
export interface ConversationData {
	id: string;
	muted: boolean;
	unreadCount: number;
	members: Array<Profile>;
}

/**
 * Represents a DM conversation on Bluesky.
 */
export class Conversation {
	/** The conversation's ID. */
	id: string;

	/** Whether the bot account has this conversation muted. */
	muted: boolean;

	/** The number of unread messages in the conversation. */
	unreadCount: number;

	/** The users that are members in this conversation. */
	members: Array<Profile>;

	/**
	 * @param data Data used to construct the conversation.
	 * @param bot The active Bot instance.
	 */
	constructor({ id, muted, unreadCount, members }: ConversationData, protected bot: Bot) {
		this.id = id;
		this.muted = muted;
		this.unreadCount = unreadCount;
		this.members = members;
	}

	/**
	 * Fetch a list of messages in this conversation.
	 * This method returns 100 messages at a time, beginning from the latest message, alongside a cursor to fetch the next 100.
	 * @param cursor The cursor to begin fetching from.
	 * @returns An array of messages and a cursor for pagination.
	 */
	async getMessages(
		cursor?: string,
	): Promise<{ cursor: string | undefined; messages: Array<ChatMessage | DeletedChatMessage> }> {
		return this.bot.getConversationMessages(this.id, { cursor: cursor ?? "", limit: 100 });
	}

	/**
	 * Send a message in the conversation.
	 * @param payload The message to send.
	 * @param options Additional options for sending the message.
	 * @returns The sent message.
	 */
	async sendMessage(
		payload: Omit<ChatMessagePayload, "conversationId">,
		options?: BotSendMessageOptions,
	): Promise<ChatMessage> {
		return this.bot.sendMessage({ conversationId: this.id, ...payload }, options);
	}

	/**
	 * Leave the conversation.
	 */
	async leave(): Promise<void> {
		return this.bot.leaveConversation(this.id);
	}

	/**
	 * Constructs an instance from a ConvoView.
	 */
	static fromView(view: ChatBskyConvoDefs.ConvoView, bot: Bot): Conversation {
		const convo = new Conversation({
			id: view.id,
			muted: view.muted,
			unreadCount: view.unreadCount,
			members: view.members.map((member) => Profile.fromView(member, bot)),
		}, bot);
		return convo;
	}
}
