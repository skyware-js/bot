import {
	AppBskyEmbedRecord,
	AppBskyEmbedRecordWithMedia,
	AppBskyFeedLike,
	AppBskyFeedPost,
	AppBskyFeedRepost,
	AppBskyGraphFollow,
	type AppBskyNotificationListNotifications,
	AtUri,
} from "@atproto/api";
import type { Firehose, FirehoseOptions } from "@skyware/firehose";
import { EventEmitter } from "node:events";
import { setInterval } from "node:timers/promises";
import { Profile } from "../struct/Profile.js";
import type { Bot } from "./Bot.js";

/**
 * How the bot will receive and emit events.
 * @enum
 */
export const EventStrategy = {
	/**
	 * By default, the bot will poll the notifications endpoint every `pollingInterval` seconds.
	 * This is less resource-intensive than the firehose strategy, but it may take up to `pollingInterval`
	 * seconds for the bot to receive new events. This strategy will not emit the `firehose` event.
	 */
	Polling: "polling",
	/**
	 * The bot will open a websocket connection to the relay and receive events in real-time.
	 * This will consume more bandwidth and CPU than the polling strategy, but the bot will receive
	 * events as soon as they are emitted.
	 */
	Firehose: "firehose",
};
export type EventStrategy = typeof EventStrategy[keyof typeof EventStrategy];

/** Options for the bot event emitter. */
export interface BotEventEmitterOptions {
	/**
	 * How the bot will receive and emit events.
	 * @default EventStrategy.Polling
	 */
	strategy?: EventStrategy;

	/**
	 * The interval in seconds at which the bot will poll the notifications endpoint. Only used if `strategy` is `EventStrategy.Polling`.
	 * @default 5
	 */
	pollingInterval?: number;

	/**
	 * The Date to begin processing notifications from. Only used if `strategy` is `EventStrategy.Polling`.
	 * @default new Date()
	 */
	processFrom?: Date;

	/**
	 * The Relay ("firehose") to connect to. Only used if `strategy` is `EventStrategy.Firehose`.
	 * @default wss://bsky.network
	 */
	relayUri?: string;

	/** Options to pass to the Firehose constructor. */
	firehoseOptions?: FirehoseOptions;
}

export class BotEventEmitter extends EventEmitter {
	/** How the bot will receive and emit events. */
	private strategy: EventStrategy;

	/**
	 * The interval in seconds at which the bot will poll the notifications endpoint.
	 * Only used if `strategy` is `EventStrategy.Polling`.
	 */
	private pollingInterval: number;

	/** The timestamp of the last notification processed, if using `EventStrategy.Polling`. */
	private lastSeen?: Date;

	/** Used to cancel polling. */
	private pollingController?: AbortController;

	/** The firehose event stream. */
	public firehose?: Firehose;

	/** Whether the bot is emitting events. */
	public emitting: boolean = false;

	/**
	 * @param options The options for the event emitter.
	 * @param bot The active Bot instance.
	 */
	constructor(options: BotEventEmitterOptions, protected bot: Bot) {
		super();
		this.strategy = options.strategy ?? EventStrategy.Polling;
		this.pollingInterval = options.pollingInterval ?? 5;
		this.lastSeen = options.processFrom ?? new Date();
		if (this.strategy === EventStrategy.Firehose) {
			import("@skyware/firehose").then(({ Firehose }) => {
				this.firehose = new Firehose(
					options.relayUri ?? "wss://bsky.network",
					options.firehoseOptions,
				);
			}).catch(() => {
				throw new Error(
					"Failed to import Firehose event emitter. Make sure you have the @skyware/firehose package installed.",
				);
			});
		} else if (this.strategy === EventStrategy.Polling) {
			this.startPolling();
		} else {
			throw new Error("Invalid event strategy");
		}
	}

	/** Start emitting events. */
	start() {
		if (this.emitting) return;
		if (this.strategy === EventStrategy.Firehose) this.startFirehose();
		else this.startPolling();
		this.emitting = true;
	}

	/** Stop emitting events. */
	stop() {
		if (!this.emitting) return;
		if (this.firehose) this.firehose.close();
		this.pollingController?.abort();
		this.emitting = false;
	}

	/** Start receiving and processing firehose events. */
	startFirehose() {
		this.firehose?.on("open", () => this.emit("open"));
		this.firehose?.on("error", (error) => this.emit("error", error));
		this.firehose?.on("websocketError", (error) => this.emit("error", error));
		this.firehose?.on("close", () => this.firehose?.start());

		this.firehose?.on("commit", (message) => {
			if (!this.bot?.hasSession || !this.bot.profile) return;
			(async () => {
				for (const op of message.ops) {
					if (op.action !== "create") continue;
					const uri = `at://${message.repo}/${op.path}`;
					if (AppBskyFeedPost.isRecord(op.record)) {
						// Direct reply
						if (
							op.record.reply?.parent.uri.includes(this.bot.profile.did)
							&& this.listenerCount("reply") >= 1
						) {
							const post = await this.bot.getPost(uri);
							this.emit("reply", post);
						}

						// Quote post
						const isQuote = AppBskyEmbedRecord.isMain(op.record.embed)
							&& op.record.embed.record.uri.includes(this.bot.profile.did);
						const isQuoteWithMedia = AppBskyEmbedRecordWithMedia.isMain(op.record.embed)
							&& op.record.embed.record.record.uri.includes(this.bot.profile.did);

						if ((isQuote || isQuoteWithMedia) && this.listenerCount("quote") >= 1) {
							const post = await this.bot.getPost(uri);
							this.emit("quote", post);
						}

						// Mention
						if (
							op.record.facets?.some((facet) =>
								facet.features.some((feature) =>
									feature.did === this.bot.profile.did
								)
							) && this.listenerCount("mention") >= 1
						) {
							const post = await this.bot.getPost(uri);
							this.emit("mention", post);
						}
					} else if (AppBskyFeedRepost.isRecord(op.record)) {
						// Repost
						if (
							op.record.subject.uri.includes(this.bot.profile.did)
							&& this.listenerCount("repost") >= 1
						) {
							const post = await this.bot.getPost(op.record.subject.uri);
							const user = await this.bot.getProfile(message.repo);
							this.emit("repost", { post, user, uri });
						}
					} else if (AppBskyFeedLike.isRecord(op.record)) {
						// Like
						if (
							op.record.subject.uri.includes(this.bot.profile.did)
							&& this.listenerCount("like") >= 1
						) {
							const post = await this.bot.getPost(op.record.subject.uri);
							const user = await this.bot.getProfile(message.repo);
							this.emit("like", { post, user, uri });
						}
					} else if (AppBskyGraphFollow.isRecord(op.record)) {
						// Follow
						if (
							op.record.subject === this.bot.profile.did
							&& this.listenerCount("follow") >= 1
						) {
							const user = await this.bot.getProfile(message.repo);
							this.emit("follow", { user, uri });
						}
					}
				}
			})().catch((error) => this.emit("error", error));
		});

		this.firehose?.start();
	}

	/** Start polling the notifications endpoint. */
	startPolling() {
		this.pollingController = new AbortController();
		const interval = setInterval(this.pollingInterval * 1000, undefined, {
			signal: this.pollingController.signal,
		});
		void (async () => {
			for await (const _ of interval) {
				await this.poll().catch((error) => this.emit("error", error));
			}
		})();
	}

	/** Poll the notifications endpoint. */
	async poll() {
		const response = await this.bot.api.app.bsky.notification.listNotifications().catch(
			(error) => {
				this.emit("error", error);
				return { success: false } as const;
			},
		);
		if (!response.success) {
			this.emit("error", response);
			return;
		}

		const { notifications } = response.data;

		const newNotifications = notifications.filter((notification) =>
			new Date(notification.indexedAt) > this.lastSeen!
		);
		if (!newNotifications.length) return;
		this.lastSeen = new Date(notifications[0].indexedAt);

		const emitInvalidRecordError = (
			notification: AppBskyNotificationListNotifications.Notification,
		) => this.emit(
			"error",
			new Error("Invalid record in notification:\n" + JSON.stringify(notification, null, 2)),
		);

		for (const notification of newNotifications) {
			switch (notification.reason) {
				case "reply": {
					if (!AppBskyFeedPost.isRecord(notification.record)) {
						emitInvalidRecordError(notification);
						break;
					}
					if (notification.record.reply) {
						const replyParentUri = new AtUri(notification.record.reply.parent.uri);
						if (replyParentUri && replyParentUri.hostname !== this.bot.profile.did) {
							// Ignore replies that aren't direct replies to the bot
							break;
						}
					}
					const reply = await this.bot.getPost(notification.uri);
					if (reply) this.emit("reply", reply);
					break;
				}
				case "quote": {
					if (!AppBskyFeedPost.isRecord(notification.record)) {
						emitInvalidRecordError(notification);
						break;
					}
					const post = await this.bot.getPost(notification.uri);
					if (post) this.emit("quote", post);
					break;
				}
				case "mention": {
					if (!AppBskyFeedPost.isRecord(notification.record)) {
						emitInvalidRecordError(notification);
						break;
					}
					const post = await this.bot.getPost(notification.uri);
					if (post) this.emit("mention", post);
					break;
				}
				case "repost": {
					if (
						!AppBskyFeedRepost.isRecord(notification.record)
						|| !notification.reasonSubject
					) {
						emitInvalidRecordError(notification);
						break;
					}
					const post = await this.bot.getPost(notification.reasonSubject);
					const user = Profile.fromView(notification.author, this.bot);
					if (post) this.emit("repost", { post, user });
					break;
				}
				case "like": {
					if (
						!AppBskyFeedLike.isRecord(notification.record)
						|| !notification.reasonSubject
					) {
						emitInvalidRecordError(notification);
						break;
					}
					const post = await this.bot.getPost(notification.reasonSubject);
					const user = Profile.fromView(notification.author, this.bot);
					if (post) this.emit("like", { post, user });
					break;
				}
				case "follow": {
					const user = Profile.fromView(notification.author, this.bot);
					this.emit("follow", user);
					break;
				}
				default: {
					console.warn("Unknown notification\n", notification);
				}
			}
		}
	}
}
