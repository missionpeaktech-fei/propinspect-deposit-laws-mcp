import type { StateFacts } from "../data/schema";

/**
 * Turns whatever the caller typed ("NV", "nevada", "New York", "new-york")
 * into a covered state code, or explains why it isn't one.
 *
 * Security: the input may come from a model that a prompt injection steered,
 * so it is only ever used as a key into a fixed map. It never becomes a
 * regex, a file path, a URL or a query, and results never echo it back.
 */

/** US jurisdictions with deposit laws that this server doesn't cover yet. */
const KNOWN_UNCOVERED: Record<string, string> = {
  dc: "District of Columbia",
  "district of columbia": "District of Columbia",
  "washington dc": "District of Columbia",
  pr: "Puerto Rico",
  "puerto rico": "Puerto Rico",
  gu: "Guam",
  guam: "Guam",
  vi: "US Virgin Islands",
  "us virgin islands": "US Virgin Islands",
  "virgin islands": "US Virgin Islands",
  as: "American Samoa",
  "american samoa": "American Samoa",
  mp: "Northern Mariana Islands",
  "northern mariana islands": "Northern Mariana Islands",
};

/** Lowercase, drop dots and commas, treat hyphens and underscores as spaces. */
export function normalizeStateInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type Resolution =
  | { kind: "covered"; stateCode: string }
  /** A real US jurisdiction we don't cover, so the answer can say so plainly. */
  | { kind: "known_uncovered"; jurisdiction: string }
  | { kind: "unknown" };

export function buildStateIndex(states: Iterable<StateFacts>): (input: string) => Resolution {
  const index = new Map<string, string>();
  for (const facts of states) {
    for (const key of [facts.stateCode, facts.state, facts.slug]) {
      index.set(normalizeStateInput(key), facts.stateCode);
    }
  }
  return (input) => {
    const key = normalizeStateInput(input);
    const stateCode = index.get(key);
    if (stateCode) return { kind: "covered", stateCode };
    const jurisdiction = KNOWN_UNCOVERED[key];
    if (jurisdiction) return { kind: "known_uncovered", jurisdiction };
    return { kind: "unknown" };
  };
}
