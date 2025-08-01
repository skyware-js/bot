import type { Did } from "@atcute/lexicons";
import type { Bot } from "../../bot/Bot.js";
import { asDid } from "../../util/lexicon.js";
import type { Profile } from "../Profile.js";
import type { Conversation } from "./Conversation.js";

/**
 * Data used to construct a BaseChatMessage class. This interface is not meant to be used directly.
 * @see BaseChatMessage
 */
export interface BaseChatMessageData {
	id: string;
	conversationId?: string | undefined;
	sender: { did: string };
	sentAt: Date;
}

/**
 * Represents some message in a chat conversation. This class is not meant to be used directly.
 * @see ChatMessage
 * @see DeletedChatMessage
 */
export class BaseChatMessage {
	/** The message's ID. */
	id: string;

	/** The ID of the conversation the message belongs to. */
	conversationId?: string;

	/** The DID of the message's sender. */
	senderDid: Did;

	/** When the message was sent. */
	sentAt: Date;

	/** The profile of the user who sent the message. */
	protected sender?: Profile;

	/** The Conversation instance this message belongs to. */
	protected conversation?: Conversation;

	/**
	 * @param data Data used to construct the message.
	 * @param bot The active Bot instance.
	 */
	constructor({ id, conversationId, sender, sentAt }: BaseChatMessageData, protected bot: Bot) {
		this.id = id;
		if (conversationId) this.conversationId = conversationId;
		this.senderDid = asDid(sender.did);
		this.sentAt = sentAt;
	}

	/**
	 * Fetch the profile of the user who sent this message.
	 */
	async getSender(): Promise<Profile> {
		if (this.sender) return this.sender;
		if (this.senderDid === this.bot.profile.did) return this.sender = this.bot.profile;
		return this.sender = await this.bot.getProfile(this.senderDid);
	}

	/**
	 * Fetch the Conversation instance this message belongs to.
	 * Returns null if the conversation could not be found.
	 */
	async getConversation(): Promise<Conversation | null> {
		if (this.conversation) return this.conversation;
		if (!this.conversationId) return null;
		return this.conversation = await this.bot.getConversation(this.conversationId);
	}
}
