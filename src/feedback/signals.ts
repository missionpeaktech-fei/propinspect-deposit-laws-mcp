import type { CallEntry } from "../mcp/callLog";
import type { Resolution } from "../core/resolveState";

/**
 * Turns the call log into signals and suggested actions: the "review" step of
 * the feedback loop (docs/feedback-loop.md). Pure, so it is tested without files.
 */

export type LoggedCall = CallEntry & { ts: string; run: string };

export interface Signals {
  calls: number;
  runs: number;
  from?: string;
  to?: string;
  byCall: Array<[string, number]>;
  topStates: Array<[string, number]>;
  notCovered: Array<{ code: string; count: number; meaning: string }>;
  faqRate?: number;
  comparisons: Array<[string, number]>;
  errors: number;
  msP50?: number;
  msMax?: number;
  actions: string[];
}

const countBy = (values: string[]) =>
  [...values.reduce((map, v) => map.set(v, (map.get(v) ?? 0) + 1), new Map<string, number>())].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );

export function summarize(entries: LoggedCall[], resolve: (code: string) => Resolution): Signals {
  const ms = entries.map((e) => e.ms).sort((a, b) => a - b);
  const lookups = entries.filter((e) => e.call === "get_deposit_rules");
  const withFaqs = lookups.filter((e) => e.includeFaqs);
  const notCovered = countBy(entries.flatMap((e) => e.notCovered ?? [])).map(([code, count]) => {
    const r = resolve(code);
    const meaning = r.kind === "known_uncovered" ? r.jurisdiction : r.kind === "unknown" ? "not a US state code" : "covered (check the log)";
    return { code, count, meaning };
  });
  const errors = entries.filter((e) => e.status === "error").length;

  const actions: string[] = [];
  for (const gap of notCovered) {
    actions.push(
      gap.meaning === "not a US state code"
        ? `"${gap.code}" was sent ${gap.count}×: the model is mapping a place to a wrong code. Check the get_deposit_rules description and add an eval case.`
        : `${gap.meaning} (${gap.code}) asked ${gap.count}× but not covered: candidate for a new PropInspect guide.`,
    );
  }
  if (lookups.length >= 5 && withFaqs.length / lookups.length >= 0.3) {
    const states = countBy(withFaqs.flatMap((e) => e.states)).slice(0, 3).map(([s]) => s).join(", ");
    actions.push(`${Math.round((withFaqs.length / lookups.length) * 100)}% of lookups needed FAQs (most: ${states}): questions go beyond the rules. Review those guides' FAQs for gaps.`);
  }
  const comparisons = countBy(entries.filter((e) => e.call === "compare_states").map((e) => [...e.states].sort().join("+")));
  if (comparisons.length) actions.push(`${comparisons.length} different multi-state comparisons: landlords with rentals in several states. Worth a note for PropInspect positioning.`);
  if (errors) actions.push(`${errors} handler error(s): read the server's stderr in the AI app's MCP log.`);
  const top = countBy(entries.flatMap((e) => e.states).filter((s) => resolve(s).kind === "covered")).slice(0, 5);
  if (top.length) actions.push(`Most asked: ${top.map(([s, n]) => `${s} (${n})`).join(", ")}. Keep these guides freshest; check their review dates first.`);

  return {
    calls: entries.length,
    runs: new Set(entries.map((e) => e.run)).size,
    from: entries[0]?.ts,
    to: entries[entries.length - 1]?.ts,
    byCall: countBy(entries.map((e) => e.call)),
    topStates: countBy(entries.flatMap((e) => e.states)).slice(0, 10),
    notCovered,
    faqRate: lookups.length ? withFaqs.length / lookups.length : undefined,
    comparisons,
    errors,
    msP50: ms.length ? ms[Math.floor(ms.length / 2)] : undefined,
    msMax: ms.length ? ms[ms.length - 1] : undefined,
    actions,
  };
}
