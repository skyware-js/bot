import type { AppBskyNotificationListNotifications } from "@atcute/client/lexicons";
import type { Firehose, FirehoseOptions } from "@skyware/firehose";
import type { Jetstream, JetstreamOptions } from "@skyware/jetstream";
import { EventEmitter } from "node:events";
import { setInterval } from "node:timers/promises";
import type { FeedGenerator } from "../struct/FeedGenerator.js";
import type { Labeler } from "../struct/Labeler.js";
import type { Post } from "../struct/post/Post.js";
import { Profile } from "../struct/Profile.js";
import { is } from "../util/lexicon.js";
import { parseAtUri } from "../util/parseAtUri.js";
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
	 * @deprecated Use `EventStrategy.Jetstream` instead. This strategy will be removed in a future version.
	 */
	Firehose: "firehose",
	/**
	 * The bot will open a websocket connection to a [Jetstream](https://github.com/bluesky-social/jetstream)
	 * instance and receive events in real-time.
	 */
	Jetstream: "jetstream",
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
	 * The interval in seconds at which the bot will poll the notifications endpoint. Only used if `strategy` is {@link EventStrategy.Polling}.
	 * @default 5
	 */
	pollingInterval?: number;

	/**
	 * The Date to begin processing notifications from. Only used if `strategy` is {@link EventStrategy.Polling}.
	 * @default new Date()
	 */
	processFrom?: Date;

	/**
	 * Options to pass to the Firehose constructor.
	 * @deprecated Use `jetstreamOptions` instead. This property, along with the {@link EventStrategy.Firehose} strategy, will be removed in a future version.
	 * @see EventStrategy.Jetstream
	 */
	firehoseOptions?: FirehoseOptions;

	/**
	 * Options to pass to the Jetstream constructor. Only used if `strategy` is {@link EventStrategy.Jetstream}.
	 * @see EventStrategy.Jetstream
	 */
	jetstreamOptions?: JetstreamOptions;
}

const JETSTREAM_EVENTS = [
	"app.bsky.feed.post",
	"app.bsky.feed.repost",
	"app.bsky.feed.like",
	"app.bsky.graph.follow",
] as const satisfies Array<string>;

export class BotEventEmitter extends EventEmitter {
	/** How the bot will receive and emit events. */
	private strategy: EventStrategy;

	/**
	 * The interval in seconds at which the bot will poll the notifications endpoint.
	 * Only used if `strategy` is {@link EventStrategy.Polling}.
	 */
	private pollingInterval: number;

	/** The timestamp of the last notification processed, if using {@link EventStrategy.Polling}. */
	private lastSeen?: Date;

	/** Used to cancel polling. */
	private pollingController?: AbortController;

	/**
	 * The firehose event stream.
	 * @deprecated Use `jetstream` instead. This property, along with the {@link EventStrategy.Firehose} strategy, will be removed in a future version.
	 */
	public firehose?: Firehose;

	/** The jetstream event stream. */
	public jetstream?: Jetstream<typeof JETSTREAM_EVENTS[number]>;

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
				this.firehose = new Firehose(options.firehoseOptions);
			}).catch((e) => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
				if (e?.code?.includes?.("MODULE_NOT_FOUND")) {
					throw new Error(
						"Failed to import Firehose event emitter. Make sure you have the @skyware/firehose package installed.",
					);
				}
				throw e;
			});
		} else if (this.strategy === EventStrategy.Jetstream) {
			import("@skyware/jetstream").then(({ Jetstream }) => {
				this.jetstream = new Jetstream({
					...options.jetstreamOptions,
					wantedCollections: JETSTREAM_EVENTS,
				});
			}).catch((e) => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
				if (e?.code?.includes?.("MODULE_NOT_FOUND")) {
					throw new Error(
						"Failed to import Jetstream event emitter. Make sure you have the @skyware/jetstream package installed.",
					);
				}
				throw e;
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
		else if (this.strategy === EventStrategy.Jetstream) this.startJetstream();
		else this.startPolling();
	}

	/** Stop emitting events. */
	stop() {
		this.firehose?.close();
		this.jetstream?.close();
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
					if (is("app.bsky.feed.post", op.record)) {
						// Direct reply
						if (
							op.record.reply?.parent.uri.includes(this.bot.profile.did)
							&& this.listenerCount("reply") >= 1
						) {
							const post = await this.bot.getPost(uri);
							this.emit("reply", post);
						}

						// Quote post
						const isQuote = is("app.bsky.embed.record", op.record.embed)
							&& op.record.embed.record.uri.includes(this.bot.profile.did);
						const isQuoteWithMedia =
							is("app.bsky.embed.recordWithMedia", op.record.embed)
							&& op.record.embed.record.record.uri.includes(this.bot.profile.did);

						if ((isQuote || isQuoteWithMedia) && this.listenerCount("quote") >= 1) {
							const post = await this.bot.getPost(uri);
							this.emit("quote", post);
						}

						// Mention
						if (
							op.record.facets?.some((facet) =>
								facet.features.some((feature) =>
									is("app.bsky.richtext.facet#mention", feature)
									&& feature.did === this.bot.profile.did
								)
							) && this.listenerCount("mention") >= 1
						) {
							const post = await this.bot.getPost(uri);
							this.emit("mention", post);
						}
					} else if (is("app.bsky.feed.repost", op.record)) {
						// Repost
						if (
							op.record.subject.uri.includes(this.bot.profile.did)
							&& this.listenerCount("repost") >= 1
						) {
							const post = await this.bot.getPost(op.record.subject.uri);
							const user = await this.bot.getProfile(message.repo);
							this.emit("repost", { post, user, uri });
						}
					} else if (is("app.bsky.feed.like", op.record)) {
						// Like
						if (
							op.record.subject.uri.includes(this.bot.profile.did)
							&& this.listenerCount("like") >= 1
						) {
							const post = await this.bot.getPost(op.record.subject.uri);
							const user = await this.bot.getProfile(message.repo);
							this.emit("like", { subject: post, user, uri });
						}
					} else if (is("app.bsky.graph.follow", op.record)) {
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

		this.emitting = true;
	}

	/** Start receiving and processing jetstream events. */
	startJetstream() {
		this.jetstream?.on("open", () => this.emit("open"));
		this.jetstream?.on("error", (error) => this.emit("error", error));
		this.jetstream?.on("close", () => this.jetstream?.start());

		this.jetstream?.onCreate(
			"app.bsky.feed.post",
			async ({ commit: { record, rkey }, did }) => {
				const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
				if (record.reply?.parent?.uri?.includes(`at://${this.bot.profile.did}`)) {
					this.emit("reply", await this.bot.getPost(uri));
				} else if (
					is("app.bsky.embed.record", record.embed)
					&& record.embed.record.uri.includes(`at://${this.bot.profile.did}`)
				) {
					this.emit("quote", await this.bot.getPost(uri));
				} else if (
					is("app.bsky.embed.recordWithMedia", record.embed)
					&& record.embed.record.record.uri.includes(`at://${this.bot.profile.did}`)
				) {
					this.emit("quote", await this.bot.getPost(uri));
				} else if (
					record.facets?.some((facet) =>
						facet.features.some((feature) =>
							is("app.bsky.richtext.facet#mention", feature)
							&& feature.did === this.bot.profile.did
						)
					)
				) {
					this.emit("mention", await this.bot.getPost(uri));
				}
			},
		);

		this.jetstream?.onCreate(
			"app.bsky.feed.repost",
			async ({ commit: { record, rkey }, did }) => {
				const uri = `at://${did}/app.bsky.feed.repost/${rkey}`;
				if (record.subject?.uri?.includes(`at://${this.bot.profile.did}`)) {
					this.emit("repost", {
						post: await this.bot.getPost(uri),
						user: await this.bot.getProfile(did),
						uri,
					});
				}
			},
		);

		this.jetstream?.onCreate(
			"app.bsky.feed.like",
			async ({ commit: { record, rkey }, did }) => {
				const uri = `at://${did}/app.bsky.feed.like/${rkey}`;
				if (record.subject?.uri?.includes(`at://${this.bot.profile.did}`)) {
					const { collection, host } = parseAtUri(record.subject.uri);
					let subject: Post | FeedGenerator | Labeler | undefined;
					switch (collection) {
						case "app.bsky.feed.post":
							subject = await this.bot.getPost(record.subject.uri);
							break;
						case "app.bsky.feed.generator":
							subject = await this.bot.getFeedGenerator(record.subject.uri);
							break;
						case "app.bsky.labeler.service":
							subject = await this.bot.getLabeler(host);
							break;
					}

					if (subject) {
						this.emit("like", {
							subject: await this.bot.getPost(uri),
							user: await this.bot.getProfile(did),
							uri,
						});
					}
				}
			},
		);

		this.jetstream?.onCreate(
			"app.bsky.graph.follow",
			async ({ commit: { record, rkey }, did }) => {
				const uri = `at://${did}/app.bsky.graph.follow/${rkey}`;
				if (record.subject === this.bot.profile.did) {
					this.emit("follow", { user: await this.bot.getProfile(did), uri });
				}
			},
		);

		this.jetstream?.start();
		this.emitting = true;
	}

	/** Start polling the notifications endpoint. */
	startPolling() {
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

	/** Poll the notifications endpoint. */
	async poll() {
		const response = await this.bot.agent.get("app.bsky.notification.listNotifications", {
			params: { limit: 100 },
		}).catch((error) => {
			this.emit("error", error);
			return null;
		});

		if (!response) return;

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
					if (!is("app.bsky.feed.post", notification.record)) {
						emitInvalidRecordError(notification);
						break;
					}
					if (notification.record.reply) {
						try {
							const { host } = parseAtUri(notification.record.reply.parent.uri);
							if (host !== this.bot.profile.did) {
								// Ignore replies that aren't direct replies to the bot
								break;
							}
						} catch (e) {
							// Ignore invalid AT URI
							break;
						}
					}
					const reply = await this.bot.getPost(notification.uri);
					if (reply) this.emit("reply", reply);
					break;
				}
				case "quote": {
					if (!is("app.bsky.feed.post", notification.record)) {
						emitInvalidRecordError(notification);
						break;
					}
					const post = await this.bot.getPost(notification.uri);
					if (post) this.emit("quote", post);
					break;
				}
				case "mention": {
					if (!is("app.bsky.feed.post", notification.record)) {
						emitInvalidRecordError(notification);
						break;
					}
					const post = await this.bot.getPost(notification.uri);
					if (post) this.emit("mention", post);
					break;
				}
				case "repost": {
					if (
						!is("app.bsky.feed.repost", notification.record)
						|| !notification.reasonSubject
					) {
						emitInvalidRecordError(notification);
						break;
					}
					const post = await this.bot.getPost(notification.reasonSubject);
					const user = Profile.fromView(notification.author, this.bot);
					if (post) this.emit("repost", { post, user, uri: notification.uri });
					break;
				}
				case "like": {
					if (
						!is("app.bsky.feed.like", notification.record)
						|| !notification.reasonSubject
					) {
						emitInvalidRecordError(notification);
						break;
					}

					const user = Profile.fromView(notification.author, this.bot);

					let subject: Post | FeedGenerator | Labeler | undefined;
					const { collection, host } = parseAtUri(notification.reasonSubject);
					switch (collection) {
						case "app.bsky.feed.post":
							subject = await this.bot.getPost(notification.reasonSubject);
							break;
						case "app.bsky.feed.generator":
							subject = await this.bot.getFeedGenerator(notification.reasonSubject);
							break;
						case "app.bsky.labeler.service":
							subject = await this.bot.getLabeler(host);
							break;
					}

					if (subject) this.emit("like", { subject, user, uri: notification.uri });
					break;
				}
				case "follow": {
					const user = Profile.fromView(notification.author, this.bot);
					this.emit("follow", { user, uri: notification.uri });
					break;
				}
				default: {
					console.warn("Unknown notification\n", notification);
				}
			}
		}
	}
}
