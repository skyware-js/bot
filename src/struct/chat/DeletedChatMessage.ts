import type { At, ChatBskyConvoDefs } from "@atcute/client/lexicons";
import type { Bot } from "../../bot/Bot.js";
import { asDid } from "../../util/lexicon.js";
import type { Profile } from "../Profile.js";
import type { Conversation } from "./Conversation.js";

/**
 * Data used to construct a DeletedChatMessage class.
 * @see DeletedChatMessage
 */
export interface DeletedChatMessageData {
	id: string;
	conversationId?: string | undefined;
	sender: { did: string };
	sentAt: Date;
}

/**
 * Represents a deleted message in a chat conversation.
 */
export class DeletedChatMessage {
	/** The message's ID. */
	id: string;

	/** The ID of the conversation the message belongs to. */
	conversationId?: string;

	/** The DID of the message's sender. */
	senderDid: At.DID;

	/** When the message was sent. */
	sentAt: Date;

	/** The profile of the user who sent the message. */
	private sender?: Profile;

	/** The Conversation instance this message belongs to. */
	private conversation?: Conversation;

	/**
	 * @param data Data used to construct the message.
	 * @param bot The active Bot instance.
	 */
	constructor(
		{ id, conversationId, sender, sentAt }: DeletedChatMessageData,
		protected bot: Bot,
	) {
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
