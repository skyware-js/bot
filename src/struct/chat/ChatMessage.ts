import type RichText from "@atcute/bluesky-richtext-builder";
import type { AppBskyRichtextFacet, ChatBskyConvoDefs } from "@atcute/client/lexicons";
import type { Bot, StrongRef } from "../../bot/Bot.js";
import { Facet } from "../post/Facet.js";
import { BaseChatMessage, type BaseChatMessageData } from "./BaseChatMessage.js";

/**
 * Data used to construct a ChatMessage class.
 * @see ChatMessage
 */
export interface ChatMessageData extends BaseChatMessageData {
	text: string;
	facets?: Array<Facet> | undefined;
	embed?: StrongRef | undefined;
}

/**
 * Represents a message in a chat conversation.
 */
export class ChatMessage extends BaseChatMessage {
	/** The message's text. */
	text: string;

	/** Annotations of text (mentions, URLs, hashtags, etc) */
	facets?: Array<Facet>;

	/** An embedded reference to a record. */
	embed?: StrongRef;

	/**
	 * @param data Data used to construct the message.
	 * @param bot The active Bot instance.
	 */
	constructor({ text, facets, embed, ...props }: ChatMessageData, bot: Bot) {
		super(props, bot);
		this.text = text;
		if (facets) this.facets = facets;
		if (embed) this.embed = embed;
	}

	/**
	 * Constructs an instance from a MessageView.
	 */
	static fromView(
		view: ChatBskyConvoDefs.MessageView,
		bot: Bot,
		conversationId?: string,
	): ChatMessage {
		const message = new ChatMessage({
			id: view.id,
			text: view.text,
			conversationId: conversationId,
			sender: view.sender,
			sentAt: new Date(view.sentAt),
			facets: view.facets?.map((facet) => new Facet(view.text, facet)),
			embed:
				view.embed?.$type === "app.bsky.embed.record#view"
					&& view.embed.record.$type === "app.bsky.embed.record#viewRecord"
					? view.embed.record
					: undefined,
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
