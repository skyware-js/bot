import type { AppBskyLabelerDefs, ComAtprotoLabelDefs } from "@atproto/api";
import type { LabelValueDefinition } from "@atproto/api/dist/client/types/com/atproto/label/defs.js";
import type { Bot } from "../bot/Bot.js";
import { Profile } from "./Profile.js";

/**
 * Data used to construct a Labeler class.
 */
export interface LabelerData {
	/** The labeler record's AT URI. */
	uri: string;

	/** The labeler record's CID. */
	cid: string;

	/** The labeler's user profile. */
	profile: Profile;

	/** The number of likes the labeler has. */
	likeCount?: number | undefined;

	/** When the labeler was indexed by the App View. */
	indexedAt: Date;

	/** The label policies published by the labeler. */
	labelDefinitions?: Array<ComAtprotoLabelDefs.LabelValueDefinition> | undefined;

	/** Any labels on the labeler record. */
	labels?: Array<ComAtprotoLabelDefs.Label> | undefined;
}

/**
 * A Bluesky labeler profile.
 */
export class Labeler {
	/** The labeler record's AT URI. */
	uri: string;

	/** The labeler record's CID. */
	cid: string;

	/** The labeler's user profile. */
	profile: Profile;

	/** The number of likes the labeler has. */
	likeCount?: number;

	/** When the labeler was indexed by the App View. */
	indexedAt: Date;

	/** The label policies published by the labeler. */
	labelDefinitions: Array<ComAtprotoLabelDefs.LabelValueDefinition>;

	/** Any labels on the labeler record. */
	labels?: Array<ComAtprotoLabelDefs.Label>;

	/**
	 * @param data Labeler data.
	 * @param bot The active Bot instance.
	 */
	constructor(
		// dprint-ignore
		{ uri, cid, profile, likeCount, indexedAt, labelDefinitions, labels }: LabelerData,
		protected bot: Bot,
	) {
		this.uri = uri;
		this.cid = cid;
		this.profile = profile;
		if (likeCount) this.likeCount = likeCount;
		this.indexedAt = indexedAt;
		this.labelDefinitions = labelDefinitions ?? [];
		this.labels = labels ?? [];
	}

	/** Subscribe to the labeler. */
	async subscribe() {
		return this.bot.addLabeler(this.profile.did);
	}

	/** Unsubscribe from the labeler. */
	async unsubscribe() {
		return this.bot.removeLabeler(this.profile.did);
	}

	/**
	 * Constructs an instance from a LabelerView.
	 * @param view The LabelerView to construct from.
	 * @param bot The active Bot instance.
	 */
	static fromView(
		view: AppBskyLabelerDefs.LabelerView | AppBskyLabelerDefs.LabelerViewDetailed,
		bot: Bot,
	): Labeler {
		const policies = view.policies;
		const labelDefinitions: Array<LabelValueDefinition> | undefined =
			typeof policies === "object" && policies && "labelValueDefinitions" in policies
				&& Array.isArray(policies.labelValueDefinitions)
				? policies.labelValueDefinitions
				: undefined;

		return new Labeler({
			uri: view.uri,
			cid: view.cid,
			profile: Profile.fromView(view.creator, bot),
			likeCount: view.likeCount,
			indexedAt: new Date(view.indexedAt),
			labelDefinitions,
			labels: view.labels,
		}, bot);
	}
}
