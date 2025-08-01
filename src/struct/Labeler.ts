import type { ComAtprotoLabelDefs } from "@atcute/atproto";
import type { AppBskyLabelerDefs } from "@atcute/bluesky";
import type { Bot } from "../bot/Bot.js";
import { Profile } from "./Profile.js";
import type { ResourceUri } from "@atcute/lexicons";
import { asUri } from "../util/lexicon.js";

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

	/** When the labeler was indexed by the AppView. */
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
	uri: ResourceUri;

	/** The labeler record's CID. */
	cid: string;

	/** The labeler's user profile. */
	profile: Profile;

	/** The number of likes the labeler has. */
	likeCount?: number;

	/** When the labeler was indexed by the AppView. */
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
		this.uri = asUri(uri);
		this.cid = cid;
		this.profile = profile;
		if (likeCount) this.likeCount = likeCount;
		this.indexedAt = indexedAt;
		this.labelDefinitions = labelDefinitions ?? [];
		this.labels = labels ?? [];
	}

	/** Subscribe to the labeler. */
	subscribe() {
		this.bot.addLabeler(this.profile.did);
	}

	/** Unsubscribe from the labeler. */
	unsubscribe() {
		this.bot.removeLabeler(this.profile.did);
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
		return new Labeler({
			uri: view.uri,
			cid: view.cid,
			profile: Profile.fromView(view.creator, bot),
			likeCount: view.likeCount,
			indexedAt: new Date(view.indexedAt),
			labelDefinitions: "policies" in view ? view.policies.labelValueDefinitions : undefined,
			labels: view.labels,
		}, bot);
	}
}
