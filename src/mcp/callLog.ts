import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

/**
 * Opt-in usage log for the feedback loop (docs/feedback-loop.md). One JSON
 * line per tool call, prompt or resource read. Off unless the operator sets
 * DEPOSIT_LAWS_CALL_LOG to a file path; nothing is ever sent anywhere.
 *
 * Privacy and safety: entries hold only what the input schemas already
 * restrict to two-letter codes and booleans, plus our own status words. No
 * free text (the deduction letter is never logged), and JSON encoding means
 * no entry can forge another.
 */

export type CallStatus = "found" | "not_covered" | "partial" | "error";

export interface CallEntry {
  /** Which tool, prompt or resource. */
  call: string;
  /** Requested state codes, uppercased; schema-checked to two letters. */
  states: string[];
  status: CallStatus;
  /** Codes that weren't covered, e.g. "DC": demand for new guides. */
  notCovered?: string[];
  includeFaqs?: boolean;
  ms: number;
}

export interface CallLog {
  record(entry: CallEntry): void;
}

export const noCallLog: CallLog = { record() {} };

export function fileCallLog(path: string): CallLog {
  // Groups calls from one server process (Claude Desktop keeps one per app session).
  const run = randomUUID().slice(0, 8);
  return {
    record(entry) {
      try {
        appendFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), run, ...entry })}\n`);
      } catch (error) {
        // Never let logging break an answer; stderr only (stdout is the protocol).
        console.error(`call log write failed: ${(error as Error).message}`);
      }
    },
  };
}
