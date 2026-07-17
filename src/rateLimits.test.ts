import { describe, expect, test } from "vitest";
import {
  DEFAULT_RATE_LIMIT_ID,
  rateLimitBuckets,
  rateLimitWindows,
  remainingPercent,
  type RateLimitSnapshot,
  type RateLimitsResponse,
} from "./rateLimits";

function snapshot(overrides: Partial<RateLimitSnapshot> = {}): RateLimitSnapshot {
  return {
    credits: { balance: "0", hasCredits: false, unlimited: false },
    limitId: "codex",
    limitName: null,
    planType: "plus",
    primary: null,
    rateLimitReachedType: null,
    secondary: null,
    ...overrides,
  };
}

describe("动态额度窗口", () => {
  test("只返回 7 天额度时仅展示一个窗口", () => {
    const windows = rateLimitWindows(
      snapshot({
        primary: {
          usedPercent: 81,
          windowDurationMins: 10080,
          resetsAt: 1784931600,
        },
      }),
    );

    expect(windows).toHaveLength(1);
    expect(windows[0].kind).toBe("sevenDay");
    expect(remainingPercent(windows[0].value)).toBe(19);
  });

  test("双窗口按时长排序，不依赖 primary 和 secondary 位置", () => {
    const windows = rateLimitWindows(
      snapshot({
        primary: {
          usedPercent: 81,
          windowDurationMins: 10080,
          resetsAt: 1784931600,
        },
        secondary: {
          usedPercent: 25,
          windowDurationMins: 300,
          resetsAt: 1784400000,
        },
      }),
    );

    expect(windows.map((windowData) => windowData.kind)).toEqual(["fiveHour", "sevenDay"]);
  });
});

describe("模型额度桶去重", () => {
  test("默认额度与 codex 别名相同时只保留一个", () => {
    const codex = snapshot({
      primary: {
        usedPercent: 81,
        windowDurationMins: 10080,
        resetsAt: 1784931600,
      },
    });
    const usage: RateLimitsResponse = {
      rateLimits: codex,
      rateLimitsByLimitId: { codex: { ...codex } },
    };

    expect(rateLimitBuckets(usage).map((bucket) => bucket.id)).toEqual([
      DEFAULT_RATE_LIMIT_ID,
    ]);
  });

  test("真正独立的模型额度桶仍然保留", () => {
    const codex = snapshot({
      primary: {
        usedPercent: 81,
        windowDurationMins: 10080,
        resetsAt: 1784931600,
      },
    });
    const usage: RateLimitsResponse = {
      rateLimits: codex,
      rateLimitsByLimitId: {
        codex: { ...codex },
        codex_spark: snapshot({
          limitId: "codex_spark",
          limitName: "Codex Spark",
          primary: {
            usedPercent: 10,
            windowDurationMins: 300,
            resetsAt: 1784400000,
          },
        }),
      },
    };

    expect(rateLimitBuckets(usage).map((bucket) => bucket.id)).toEqual([
      DEFAULT_RATE_LIMIT_ID,
      "codex_spark",
    ]);
  });
});
