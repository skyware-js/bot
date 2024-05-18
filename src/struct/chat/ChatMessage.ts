import {
	AppBskyEmbedRecord,
	type AppBskyRichtextFacet,
	type ChatBskyConvoDefs,
} from "@atproto/api";
import type { Bot, StrongRef } from "../../bot/Bot.js";
import type { RichText } from "../../richtext/RichText.js";
import { Facet } from "../post/Facet.js";
import type { Profile } from "../Profile.js";

/**
 * Data used to construct a ChatMessage class.
 * @see ChatMessage
 */
export interface ChatMessageData {
	id: string;
	text: string;
	sender: { did: string };
	sentAt: Date;
	facets?: Array<Facet> | undefined;
	embed?: StrongRef | undefined;
}

/**
 * Represents a message in a chat conversation.
 */
export class ChatMessage {
	/** The message's ID. */
	id: string;

	/** The message's text. */
	text: string;

	/** The DID of the message's sender. */
	senderDid: string;

	/** When the message was sent. */
	sentAt: Date;

	/** Annotations of text (mentions, URLs, hashtags, etc) */
	facets?: Array<Facet>;

	/** An embedded reference to a record. */
	embed?: StrongRef;

	/** The profile of the user who sent the message. */
	private sender?: Profile;

	/**
	 * @param data Data used to construct the message.
	 * @param bot The active Bot instance.
	 */
	constructor({ id, text, sender, sentAt, facets, embed }: ChatMessageData, protected bot: Bot) {
		this.id = id;
		this.text = text;
		this.senderDid = sender.did;
		this.sentAt = sentAt;
		if (facets) this.facets = facets;
		if (embed) this.embed = embed;
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
	static fromView(view: ChatBskyConvoDefs.MessageView, bot: Bot): ChatMessage {
		const message = new ChatMessage({
			id: view.id,
			text: view.text,
			sender: view.sender,
			sentAt: new Date(view.sentAt),
			facets: view.facets?.map((facet) => new Facet(view.text, facet)),
			embed: AppBskyEmbedRecord.isMain(view.embed) ? view.embed.record : undefined,
		}, bot);
		return message;
	}
}

/**
 * Data that can be used to create a ChatMessage.
 */
export interface ChatMessagePayload {
	/** The ID of the conversation to send this message in. */
	conversationId: string;

	/** The message text. Can be a string or a RichText instance containing facets. */
	text: string | RichText;

	/**
	 * A facet represents a range within the message's text that has special meaning
	 * (e.g. mentions, links, tags). Prefer to use the {@link RichText} class to create
	 * posts with facets.
	 */
	facets?: Array<AppBskyRichtextFacet.Main> | undefined;

	/** A reference to a record to embed in the message. */
	embed?: StrongRef | undefined;
}
