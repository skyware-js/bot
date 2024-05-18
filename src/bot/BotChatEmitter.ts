import { ChatBskyConvoDefs } from "@atproto/api";
import { EventEmitter } from "node:events";
import { setInterval } from "node:timers/promises";
import { ChatMessage } from "../struct/chat/ChatMessage.js";
import type { Bot } from "./Bot.js";

/** Options for the bot chat event emitter. */
export interface BotChatEmitterOptions {
	/**
	 * The interval in seconds at which the bot will poll the chat log endpoint.
	 * @default 5
	 */
	pollingInterval?: number;
}

export class BotChatEmitter extends EventEmitter {
	/**
	 * The interval in seconds at which the bot will poll the chat log endpoint.
	 */
	private pollingInterval: number;

	/** Used to cancel polling. */
	private pollingController?: AbortController;

	/** The cursor to use for the next poll. */
	private cursor?: string;

	/** Whether the emitter is emitting events. */
	public emitting: boolean = false;

	/**
	 * @param options The options for the event emitter.
	 * @param bot The active Bot instance.
	 */
	constructor(options: BotChatEmitterOptions, protected bot: Bot) {
		super();
		this.pollingInterval = options.pollingInterval ?? 5;
		this.start();
	}

	/** Start polling the chat log endpoint. */
	start() {
		if (this.emitting) return;

		if (this.pollingController) this.pollingController.abort();

		this.pollingController = new AbortController();
		const interval = setInterval(this.pollingInterval * 1000, undefined, {
			signal: this.pollingController.signal,
		});
		void (async () => {
			for await (const _ of interval) {
				await this.poll().catch((error) => this.emit("error", error));
			}
		})();

		this.emitting = true;
	}

	/** Stop emitting events. */
	stop() {
		this.pollingController?.abort();
		this.emitting = false;
	}

	/** Poll the chat log endpoint. */
	async poll() {
		if (!this.bot.chatProxy) return;

		const response = await this.bot.chatProxy.api.chat.bsky.convo.getLog({
			cursor: this.cursor ?? "",
		}).catch((error) => {
			this.emit("error", error);
			return { success: false } as const;
		});
		if (!response.success) {
			this.emit("error", response);
			return;
		}

		const { cursor, logs } = response.data;

		if (cursor) this.cursor = cursor;

		for (const log of logs) {
			if (ChatBskyConvoDefs.isLogCreateMessage(log)) {
				const message = log.message;
				if (ChatBskyConvoDefs.isMessageView(message)) {
					this.emit("message", ChatMessage.fromView(message, this.bot));
				} else if (ChatBskyConvoDefs.isDeletedMessageView(message)) {
					continue;
				} else {
					this.emit(
						"error",
						new Error("Unknown chat message received: " + JSON.stringify(message)),
					);
				}
			}
		}
	}
}
