export type RateLimitWindow = {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
};

export type CreditsSnapshot = {
  balance: string | null;
  hasCredits: boolean;
  unlimited: boolean;
};

export type RateLimitSnapshot = {
  credits: CreditsSnapshot | null;
  limitId: string | null;
  limitName: string | null;
  planType: string | null;
  primary: RateLimitWindow | null;
  rateLimitReachedType: string | null;
  secondary: RateLimitWindow | null;
};

export type RateLimitsResponse = {
  rateLimits: RateLimitSnapshot;
  rateLimitsByLimitId: Record<string, RateLimitSnapshot> | null;
};

export type RateLimitWindowKind = "fiveHour" | "sevenDay" | "custom";

export type DisplayRateLimitWindow = {
  key: string;
  kind: RateLimitWindowKind;
  value: RateLimitWindow;
};

export type RateLimitBucket = {
  id: string;
  limit: RateLimitSnapshot;
};

export const DEFAULT_RATE_LIMIT_ID = "__default__";

export function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function remainingPercent(windowData: RateLimitWindow | null) {
  if (!windowData) return null;
  return 100 - clampPercent(windowData.usedPercent);
}

export function rateLimitWindowKind(windowData: RateLimitWindow): RateLimitWindowKind {
  if (windowData.windowDurationMins === 300) return "fiveHour";
  if (windowData.windowDurationMins === 10080) return "sevenDay";
  return "custom";
}

function windowFingerprint(windowData: RateLimitWindow) {
  return [windowData.windowDurationMins, windowData.resetsAt, windowData.usedPercent].join(":");
}

export function rateLimitWindows(limit: RateLimitSnapshot | null): DisplayRateLimitWindow[] {
  if (!limit) return [];

  const seen = new Set<string>();
  const candidates = [limit.primary, limit.secondary]
    .filter((windowData): windowData is RateLimitWindow => Boolean(windowData))
    .filter((windowData) => {
      const fingerprint = windowFingerprint(windowData);
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    })
    .sort((left, right) => {
      const leftDuration = left.windowDurationMins ?? Number.MAX_SAFE_INTEGER;
      const rightDuration = right.windowDurationMins ?? Number.MAX_SAFE_INTEGER;
      return leftDuration - rightDuration;
    });

  return candidates.map((value, index) => {
    const kind = rateLimitWindowKind(value);
    const durationKey = value.windowDurationMins ?? "unknown";
    return {
      key: `${kind}:${durationKey}:${index}`,
      kind,
      value,
    };
  });
}

function sameWindow(left: RateLimitWindow | null, right: RateLimitWindow | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  return windowFingerprint(left) === windowFingerprint(right);
}

function sameLimitUsage(left: RateLimitSnapshot, right: RateLimitSnapshot) {
  return (
    sameWindow(left.primary, right.primary) &&
    sameWindow(left.secondary, right.secondary) &&
    left.planType === right.planType &&
    left.rateLimitReachedType === right.rateLimitReachedType
  );
}

export function rateLimitBuckets(usage: RateLimitsResponse | null): RateLimitBucket[] {
  if (!usage) return [];

  const buckets: RateLimitBucket[] = [
    { id: DEFAULT_RATE_LIMIT_ID, limit: usage.rateLimits },
  ];

  if (!usage.rateLimitsByLimitId) return buckets;

  for (const [id, limit] of Object.entries(usage.rateLimitsByLimitId)) {
    if (!limit || id === DEFAULT_RATE_LIMIT_ID) continue;

    const isDefaultAlias =
      (id === usage.rateLimits.limitId || limit.limitId === usage.rateLimits.limitId) &&
      sameLimitUsage(limit, usage.rateLimits);
    if (isDefaultAlias) continue;

    buckets.push({ id, limit });
  }

  return buckets;
}

export function resolveActiveLimit(
  usage: RateLimitsResponse | null,
  activeRateLimitId: string,
) {
  if (!usage) return null;
  if (
    activeRateLimitId &&
    activeRateLimitId !== DEFAULT_RATE_LIMIT_ID &&
    usage.rateLimitsByLimitId?.[activeRateLimitId]
  ) {
    return usage.rateLimitsByLimitId[activeRateLimitId];
  }

  return usage.rateLimits;
}
