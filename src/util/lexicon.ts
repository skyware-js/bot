import {
	AppBskyActorProfile,
	AppBskyActorStatus,
	AppBskyFeedGenerator,
	AppBskyFeedLike,
	AppBskyFeedPost,
	AppBskyFeedPostgate,
	AppBskyFeedRepost,
	AppBskyFeedThreadgate,
	AppBskyGraphBlock,
	AppBskyGraphFollow,
	AppBskyGraphList,
	AppBskyGraphListblock,
	AppBskyGraphListitem,
	AppBskyGraphStarterpack,
	AppBskyGraphVerification,
	AppBskyLabelerService,
	AppBskyNotificationDeclaration,
	ChatBskyActorDeclaration,
} from "@atcute/bluesky";
import {
	type Did,
	type InferOutput,
	is as lexIs,
	isResourceUri,
	type ResourceUri,
} from "@atcute/lexicons";
import { type ActorIdentifier, isActorIdentifier, isDid } from "@atcute/lexicons/syntax";
import type { StrongRef } from "../bot/Bot.js";

export const lexicons = {
	"app.bsky.actor.profile": AppBskyActorProfile.mainSchema,
	"app.bsky.actor.status": AppBskyActorStatus.mainSchema,
	"app.bsky.feed.generator": AppBskyFeedGenerator.mainSchema,
	"app.bsky.feed.like": AppBskyFeedLike.mainSchema,
	"app.bsky.feed.post": AppBskyFeedPost.mainSchema,
	"app.bsky.feed.postgate": AppBskyFeedPostgate.mainSchema,
	"app.bsky.feed.repost": AppBskyFeedRepost.mainSchema,
	"app.bsky.feed.threadgate": AppBskyFeedThreadgate.mainSchema,
	"app.bsky.graph.block": AppBskyGraphBlock.mainSchema,
	"app.bsky.graph.follow": AppBskyGraphFollow.mainSchema,
	"app.bsky.graph.list": AppBskyGraphList.mainSchema,
	"app.bsky.graph.listblock": AppBskyGraphListblock.mainSchema,
	"app.bsky.graph.listitem": AppBskyGraphListitem.mainSchema,
	"app.bsky.graph.starterpack": AppBskyGraphStarterpack.mainSchema,
	"app.bsky.graph.verification": AppBskyGraphVerification.mainSchema,
	"app.bsky.labeler.service": AppBskyLabelerService.mainSchema,
	"chat.bsky.actor.declaration": ChatBskyActorDeclaration.mainSchema,
	"app.bsky.notification.declaration": AppBskyNotificationDeclaration.mainSchema,
};

export function is<T extends keyof typeof lexicons>(
	type: T,
	value: unknown,
): value is InferOutput<typeof lexicons[T]>;
export function is<V extends { $type?: string | undefined }, const Type extends V["$type"]>(
	type: Type,
	value: V,
): value is V & { $type: Type };
export function is(type: string, value: unknown): value is unknown;
export function is(type: string, value: unknown): boolean {
	if (type in lexicons) return lexIs(lexicons[type as keyof typeof lexicons], value);
	if (value && typeof value === "object" && "$type" in value) return value.$type === type;
	return false;
}

export const asDid = (did: string): Did => {
	if (!isDid(did)) throw new Error("Invalid DID: " + did);
	return did;
};

export const asUri = (uri: string): ResourceUri => {
	if (!isResourceUri(uri)) throw new Error("Invalid URI: " + uri);
	return uri;
};

export const asIdentifier = (identifier: string): ActorIdentifier => {
	if (!isActorIdentifier(identifier)) throw new Error("Invalid identifier: " + identifier);
	return identifier;
};

export const asStrongRef = (ref: StrongRef): { uri: ResourceUri; cid: string } => {
	return { uri: asUri(ref.uri), cid: ref.cid };
};
