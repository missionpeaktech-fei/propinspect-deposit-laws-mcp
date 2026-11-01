/**
 * The review step of the feedback loop: summarize the call log into signals
 * and suggested actions.
 *
 *   npm run signals                    reads logs/calls.jsonl
 *   npm run signals -- path/to/log     reads another log
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadDepositLaws } from "../src/data/load";
import { buildStateIndex } from "../src/core/resolveState";
import { summarize, type LoggedCall } from "../src/feedback/signals";

const path = process.argv[2] ?? fileURLToPath(new URL("../logs/calls.jsonl", import.meta.url));
if (!existsSync(path)) {
  console.log(`No call log at ${path} yet. Set DEPOSIT_LAWS_CALL_LOG in the AI app's server config, use the server, then run this again.`);
  process.exit(0);
}

const entries: LoggedCall[] = readFileSync(path, "utf8")
  .split("\n")
  .filter(Boolean)
  .flatMap((line) => {
    try {
      return [JSON.parse(line) as LoggedCall];
    } catch {
      return [];
    }
  });

const s = summarize(entries, buildStateIndex(loadDepositLaws().byCode.values()));
const pct = (n?: number) => (n === undefined ? "n/a" : `${Math.round(n * 100)}%`);

console.log(`Signals from ${s.calls} calls in ${s.runs} server run(s), ${s.from ?? "-"} → ${s.to ?? "-"}\n`);
console.log(`By call:        ${s.byCall.map(([c, n]) => `${c} ${n}`).join(", ") || "-"}`);
console.log(`Top states:     ${s.topStates.map(([c, n]) => `${c} ${n}`).join(", ") || "-"}`);
console.log(`Not covered:    ${s.notCovered.map((g) => `${g.code} ${g.count} (${g.meaning})`).join(", ") || "none"}`);
console.log(`FAQ requests:   ${pct(s.faqRate)} of lookups`);
console.log(`Comparisons:    ${s.comparisons.map(([set, n]) => `${set} ${n}`).join(", ") || "none"}`);
console.log(`Errors:         ${s.errors}`);
console.log(`Speed:          median ${s.msP50 ?? "-"} ms, max ${s.msMax ?? "-"} ms`);
console.log(`\nSuggested actions:\n${s.actions.map((a) => `- ${a}`).join("\n") || "- none yet: use the server more."}`);
