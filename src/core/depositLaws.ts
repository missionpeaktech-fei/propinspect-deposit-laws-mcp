import type { DepositLawData } from "../data/load";
import type { StateFacts } from "../data/schema";
import { buildStateIndex, type Resolution } from "./resolveState";

/**
 * The core: plain functions over the validated snapshot. No MCP, no I/O.
 *
 * "Parse, don't validate": the data arrives already checked by the loader,
 * so nothing here re-checks it. Callers' inputs are only resolved through
 * the fixed state index.
 *
 * Every successful answer carries a citation, built here in one place, so no
 * caller can return a fact without its source.
 */

export interface Citation {
  guideUrl: string;
  /** ISO date of the last source review. */
  lastReviewed: string;
  statute: { name: string; url: string };
  disclaimer: string;
}

export interface CoveredState {
  stateCode: string;
  state: string;
  guideUrl: string;
  lastReviewed: string;
}

export type StateRulesResult =
  | {
      status: "found";
      stateCode: string;
      state: string;
      rules: StateFacts["comparison"];
      summary: StateFacts["summary"];
      references: StateFacts["references"];
      faqs: StateFacts["faqs"];
      citation: Citation;
    }
  | NotCovered;

/**
 * Deliberately does not repeat what the caller typed: the input may carry
 * injected instructions, and echoing it would hand them back to the model.
 */
export interface NotCovered {
  status: "not_covered";
  reason: string;
  coveredStateCodes: string[];
}

export interface ComparisonRow {
  stateCode: string;
  state: string;
  rules: StateFacts["comparison"];
  citation: Citation;
}

export interface CompareResult {
  rows: ComparisonRow[];
  /** One entry per input that isn't a covered state, in input order. */
  notCovered: Array<{ position: number; reason: string }>;
}

export interface DepositLawCore {
  listStates(): { count: number; reviewedBetween: { oldest: string; newest: string }; states: CoveredState[] };
  getRules(state: string): StateRulesResult;
  compareStates(states: readonly string[]): CompareResult;
}

export function createDepositLawCore(data: DepositLawData): DepositLawCore {
  const resolve = buildStateIndex(data.byCode.values());
  const coveredStateCodes = [...data.byCode.keys()].sort();

  const factsFor = (stateCode: string): StateFacts => {
    const facts = data.byCode.get(stateCode);
    // The index is built from the same map, so this can't happen unless a bug breaks that.
    if (!facts) throw new Error(`invariant: indexed state ${stateCode} has no facts`);
    return facts;
  };

  const citationFor = (facts: StateFacts): Citation => ({
    guideUrl: facts.url,
    lastReviewed: facts.lastReviewed,
    statute: facts.statute,
    disclaimer: facts.disclaimer,
  });

  const reasonFor = (resolution: Exclude<Resolution, { kind: "covered" }>): string =>
    resolution.kind === "known_uncovered"
      ? `${resolution.jurisdiction} is not covered. This server covers the 50 US states only.`
      : "Not a recognized US state. Use a two-letter code (e.g. NV) or a state name (e.g. Nevada).";

  return {
    listStates() {
      const states = coveredStateCodes.map((code) => {
        const facts = factsFor(code);
        return { stateCode: code, state: facts.state, guideUrl: facts.url, lastReviewed: facts.lastReviewed };
      });
      // ISO dates sort correctly as text.
      const dates = states.map((s) => s.lastReviewed).sort();
      return {
        count: states.length,
        reviewedBetween: { oldest: dates[0]!, newest: dates[dates.length - 1]! },
        states,
      };
    },

    getRules(state) {
      const resolution = resolve(state);
      if (resolution.kind !== "covered") {
        return { status: "not_covered", reason: reasonFor(resolution), coveredStateCodes };
      }
      const facts = factsFor(resolution.stateCode);
      return {
        status: "found",
        stateCode: facts.stateCode,
        state: facts.state,
        rules: facts.comparison,
        summary: facts.summary,
        references: facts.references,
        faqs: facts.faqs,
        citation: citationFor(facts),
      };
    },

    compareStates(states) {
      const rows: ComparisonRow[] = [];
      const notCovered: CompareResult["notCovered"] = [];
      const seen = new Set<string>();
      states.forEach((input, position) => {
        const resolution = resolve(input);
        if (resolution.kind !== "covered") {
          notCovered.push({ position, reason: reasonFor(resolution) });
          return;
        }
        if (seen.has(resolution.stateCode)) return; // "NV" and "Nevada" are one row
        seen.add(resolution.stateCode);
        const facts = factsFor(resolution.stateCode);
        rows.push({ stateCode: facts.stateCode, state: facts.state, rules: facts.comparison, citation: citationFor(facts) });
      });
      return { rows, notCovered };
    },
  };
}
