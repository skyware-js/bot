import {
	AppBskyEmbedRecord,
	AppBskyEmbedRecordWithMedia,
	AppBskyFeedLike,
	AppBskyFeedPost,
	AppBskyFeedRepost,
	AppBskyGraphFollow,
	AppBskyNotificationListNotifications,
	AtUri,
} from "@atproto/api";
import type { Firehose, FirehoseOptions } from "@skyware/firehose";
import { EventEmitter as BaseEventEmitter } from "node:events";
import type { Post } from "../struct/post/Post";
import { Profile } from "../struct/Profile";
import type { Bot } from "./Bot";

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

export interface BotEventEmitterOptions {
	/**
	 * How the bot will receive and emit events
	 * @default EventStrategy.Polling
	 */
	strategy: EventStrategy;

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

	/** Options to pass to the Firehose constructor */
	firehoseOptions?: FirehoseOptions;
}

export class BotEventEmitter extends BaseEventEmitter {
	/** How the bot will receive and emit events */
	private strategy: EventStrategy;

	/**
	 * The interval in seconds at which the bot will poll the notifications endpoint. Only used if `strategy` is `EventStrategy.Polling`.
	 */
	private pollingInterval: number;

	/** The timestamp of the last notification processed, if using `EventStrategy.Polling`. */
	private lastSeen?: Date;

	/** The firehose event stream */
	public firehose?: Firehose;

	constructor(options: BotEventEmitterOptions, private bot: Bot) {
		super();
		this.strategy = options.strategy;
		this.pollingInterval = options.pollingInterval ?? 5;
		this.lastSeen = options.processFrom ?? new Date();
		if (this.strategy === EventStrategy.Firehose) {
			import("@skyware/firehose").then(({ Firehose }) => {
				this.firehose = new Firehose(
					options.relayUri ?? "wss://bsky.network",
					options.firehoseOptions,
				);

				this.firehose.on("open", () => this.emit("open"));
				this.firehose.on("error", (error) => this.emit("error", error));
				this.firehose.on("websocketError", (error) => this.emit("error", error));
				this.firehose.on("close", () => this.firehose?.start());

				this.firehose.on("commit", async (message) => {
					if (!bot?.agent?.hasSession || !bot.profile) return;
					for (const op of message.ops) {
						if (op.action !== "create") continue;
						const uri = `at://${message.repo}/${op.path}`;
						if (AppBskyFeedPost.isRecord(op.record)) {
							let post: Post;
							// Direct reply
							if (
								op.record.reply?.parent.uri.includes(this.bot.profile.did)
								&& this.listenerCount("reply") >= 1
							) {
								post ??= await this.bot.getPost(uri);
								this.emit("reply", post);
							}
							// Quote post
							if (
								((AppBskyEmbedRecord.isMain(op.record.embed)
									&& op.record.embed.record.uri.includes(this.bot.profile.did))
									|| (AppBskyEmbedRecordWithMedia.isMain(op.record.embed)
										&& op.record.embed.record.record.uri.includes(
											this.bot.profile.did,
										))) && this.listenerCount("quote") >= 1
							) {
								post ??= await this.bot.getPost(uri);
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
								post ??= await this.bot.getPost(uri);
								this.emit("mention", post);
							}
						} else if (AppBskyFeedRepost.isRecord(op.record)) {
							if (
								op.record.subject.uri.includes(this.bot.profile.did)
								&& this.listenerCount("repost") >= 1
							) {
								const post = await this.bot.getPost(op.record.subject.uri);
								const user = await this.bot.getProfile(message.repo);
								this.emit("repost", { post, user });
							}
						} else if (AppBskyFeedLike.isRecord(op.record)) {
							if (
								op.record.subject.uri.includes(this.bot.profile.did)
								&& this.listenerCount("like") >= 1
							) {
								const post = await this.bot.getPost(op.record.subject.uri);
								const user = await this.bot.getProfile(message.repo);
								this.emit("like", { post, user });
							}
						} else if (AppBskyGraphFollow.isRecord(op.record)) {
							if (
								op.record.subject === this.bot.profile.did
								&& this.listenerCount("follow") >= 1
							) {
								const user = await this.bot.getProfile(message.repo);
								this.emit("follow", user);
							}
						}
					}
				});

				this.firehose.start();
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

	/** Close the firehose connection */
	close() {
		if (this.firehose) this.firehose.close();
	}

	/** Start polling the notifications endpoint */
	startPolling() {
		setInterval(
			() => void this.poll().catch((error) => this.emit("error", error)),
			this.pollingInterval * 1000,
		);
	}

	/** Poll the notifications endpoint */
	async poll() {
		const response = await this.bot.agent.api.app.bsky.notification.listNotifications();
		if (!response.success) this.emit("error", response);

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
