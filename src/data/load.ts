import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SnapshotSchema, type Snapshot, type StateFacts } from "./schema";
import { US_STATE_CODES } from "./usStates";

export const DEFAULT_SNAPSHOT_PATH = fileURLToPath(new URL("../../data/deposit-laws.json", import.meta.url));

export class SnapshotError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Deposit-law snapshot is invalid:\n- ${problems.join("\n- ")}`);
    this.name = "SnapshotError";
  }
}

export interface DepositLawData {
  meta: Omit<Snapshot, "states">;
  /** Keyed by two-letter state code. */
  byCode: ReadonlyMap<string, StateFacts>;
}

/**
 * Checks a parsed snapshot and builds the lookup the server uses.
 *
 * Fails loudly: any problem throws, listing every problem found. The server
 * never starts with partial data, because a missing state would be answered
 * as "not covered" when the truth is "we have a guide for that".
 */
export function validateSnapshot(raw: unknown): DepositLawData {
  const parsed = SnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SnapshotError(parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`));
  }
  const { states, ...meta } = parsed.data;
  const problems: string[] = [];

  if (meta.count !== states.length) {
    problems.push(`count says ${meta.count} but the snapshot has ${states.length} states`);
  }

  const byCode = new Map<string, StateFacts>();
  for (const facts of states) {
    if (byCode.has(facts.stateCode)) problems.push(`${facts.stateCode} appears more than once`);
    byCode.set(facts.stateCode, facts);
  }

  const expected = new Set<string>(US_STATE_CODES);
  const missing = US_STATE_CODES.filter((code) => !byCode.has(code));
  const unexpected = [...byCode.keys()].filter((code) => !expected.has(code));
  if (missing.length) problems.push(`missing states: ${missing.join(", ")}`);
  if (unexpected.length) problems.push(`not US state codes: ${unexpected.join(", ")}`);

  if (problems.length) throw new SnapshotError(problems);
  return { meta, byCode };
}

/** Reads and validates the snapshot file. Called once at server startup. */
export function loadDepositLaws(path: string = DEFAULT_SNAPSHOT_PATH): DepositLawData {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new SnapshotError([`could not read ${path}: ${(error as Error).message}`]);
  }
  return validateSnapshot(raw);
}
