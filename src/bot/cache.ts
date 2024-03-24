import QuickLRU from "quick-lru";

/**
 * Options for request caching.
 */
export interface CacheOptions {
	/**
	 * The maximum age of a cached item in seconds.
	 * @default `12 * 60 * 60` (12 hours)
	 */
	maxAge?: number;

	/**
	 * The maximum number of entries in the cache.
	 * @default 250
	 */
	maxEntries?: number;
}

const DEFAULT_CACHE_OPTIONS = { maxAge: 12 * 60 * 60, maxEntries: 250 };

export const makeCache = <T>(options?: CacheOptions | undefined) => {
	options = { ...DEFAULT_CACHE_OPTIONS, ...options };
	return new QuickLRU<string, T>({
		maxAge: options.maxAge! * 1000,
		maxSize: options.maxEntries!,
	});
};
