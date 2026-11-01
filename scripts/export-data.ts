/**
 * Export pipeline: PropInspect app (source of truth) → data/deposit-laws.json.
 *
 *   npm run export-data              write a new snapshot from origin/main
 *   npm run check-data               exit 1 if the snapshot has drifted from the source
 *
 * Options: --app-repo <path> (default ../Property-Inspection), --ref <git ref> (default origin/main).
 *
 * Solo-project shortcut, named on purpose: this script reads the app's
 * internal file. In a company, the team that owns the data would publish a
 * versioned artifact and consumers would never read its internals.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GUIDE_URL_PREFIX, SCHEMA_VERSION, type Snapshot, type StateFacts } from "../src/data/schema";
import { DEFAULT_SNAPSHOT_PATH, validateSnapshot } from "../src/data/load";

const SOURCE_FILE = "shared/securityDepositLaws.ts";

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const appRepo = resolve(projectRoot, option("--app-repo", "../Property-Inspection"));
const ref = option("--ref", "origin/main");
const checkOnly = process.argv.includes("--check");

const git = (...args: string[]) => execFileSync("git", ["-C", appRepo, ...args], { encoding: "utf8" }).trim();

// Read the source from a commit, not the working copy: the snapshot then
// names exactly what it was built from, and uncommitted edits can't leak in.
const commit = git("rev-parse", `${ref}^{commit}`);
const workDir = mkdtempSync(join(tmpdir(), "deposit-law-export-"));

// Minimal view of the source type: only the fields we export (facts only).
interface SourceGuide {
  state: string;
  stateCode: string;
  slug: string;
  lastReviewed: string;
  footerAdviceResource: string;
  statute: { name: string; url: string };
  comparison: StateFacts["comparison"] & { statuteLabel?: string };
  summaryItems: Array<{ label: string; rule: string }>;
  references: StateFacts["references"];
  faqs: StateFacts["faqs"];
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The source writes review dates two ways ("2026-09-18" and "September 18,
 * 2026"). The snapshot contract has one: an ISO date. Parsed by hand, not with
 * Date, so no time zone can move a date by a day.
 */
function toIsoDate(value: string, stateCode: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(value);
  const month = match ? MONTHS.indexOf(match[1]!) + 1 : 0;
  if (!match || month === 0) throw new Error(`${stateCode}: unrecognized lastReviewed date "${value}"`);
  return `${match[3]}-${String(month).padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
}

/** "2026-09-18" → "September 18, 2026", the way the website shows it. */
function formatLongDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`;
}

try {
  // Extract the whole shared/ folder so the file's own imports still resolve.
  execFileSync("sh", ["-c", `git -C "$0" archive "$1" shared | tar -x -C "$2"`, appRepo, commit, workDir]);
  const source = (await import(pathToFileURL(join(workDir, SOURCE_FILE)).href)) as {
    PUBLISHED_SECURITY_DEPOSIT_LAW_STATES: SourceGuide[];
    SECURITY_DEPOSIT_GUIDE_FOOTER_DISCLAIMER_TEMPLATE: string;
  };

  // The website's footer says "This page ... this page". In an answer, the
  // thing we reviewed is the guide we link to, so say "this guide". Fail if
  // the wording moves, rather than silently shipping "page".
  const websiteTemplate = source.SECURITY_DEPOSIT_GUIDE_FOOTER_DISCLAIMER_TEMPLATE;
  if (!/this page/i.test(websiteTemplate)) {
    throw new Error('disclaimer template no longer says "this page"; update the wording rule in export-data.ts');
  }
  const disclaimerTemplate = websiteTemplate.replace(/\b(t)his page\b/gi, (_, t: string) => `${t}his guide`);

  const fill = (template: string, values: Record<string, string>) =>
    template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      if (!(key in values)) throw new Error(`disclaimer template uses an unknown field {{${key}}}`);
      return values[key]!;
    });

  const states: StateFacts[] = source.PUBLISHED_SECURITY_DEPOSIT_LAW_STATES.map((guide) => ({
    state: guide.state,
    stateCode: guide.stateCode,
    slug: guide.slug,
    url: `${GUIDE_URL_PREFIX}${guide.slug}`,
    lastReviewed: toIsoDate(guide.lastReviewed, guide.stateCode),
    statute: { name: guide.statute.name, url: guide.statute.url },
    comparison: {
      depositCap: guide.comparison.depositCap,
      returnDeadline: guide.comparison.returnDeadline,
      wrongfulWithholdingPenalty: guide.comparison.wrongfulWithholdingPenalty,
      moveInRecordRule: guide.comparison.moveInRecordRule,
      ...(guide.comparison.scope ? { scope: guide.comparison.scope } : {}),
    },
    summary: guide.summaryItems.map(({ label, rule }) => ({ label, rule })),
    references: guide.references.map(({ label, url, type }) => ({ label, url, type })),
    faqs: guide.faqs.map(({ question, answer }) => ({ question, answer })),
    // The website's footer template and fields, with "this guide" for answers.
    disclaimer: fill(disclaimerTemplate, {
      date: formatLongDate(toIsoDate(guide.lastReviewed, guide.stateCode)),
      statute: guide.statute.name,
      article: /^[AEIOU]/i.test(guide.state) ? "an" : "a",
      state: guide.state,
      resource: guide.footerAdviceResource,
    }),
  }));
  states.sort((a, b) => a.stateCode.localeCompare(b.stateCode));

  const snapshot: Snapshot = {
    schemaVersion: SCHEMA_VERSION,
    source: { file: SOURCE_FILE, commit },
    exportedAt: new Date().toISOString(),
    count: states.length,
    states,
  };

  // Same contract the server checks at startup: never write a snapshot the server would reject.
  validateSnapshot(snapshot);

  if (checkOnly) {
    const current = JSON.parse(readFileSync(DEFAULT_SNAPSHOT_PATH, "utf8")) as Snapshot;
    const before = new Map(current.states.map((facts) => [facts.stateCode, JSON.stringify(facts)]));
    const changed = states.filter((facts) => before.get(facts.stateCode) !== JSON.stringify(facts)).map((f) => f.stateCode);
    const removed = current.states.map((f) => f.stateCode).filter((code) => !states.some((f) => f.stateCode === code));
    if (changed.length || removed.length) {
      console.error(`Snapshot is out of date with ${ref} (${commit.slice(0, 7)}).`);
      if (changed.length) console.error(`  changed or new: ${changed.join(", ")}`);
      if (removed.length) console.error(`  removed: ${removed.join(", ")}`);
      console.error("Run: npm run export-data");
      process.exit(1);
    }
    console.log(`Snapshot matches ${ref} (${commit.slice(0, 7)}): ${states.length} states.`);
  } else {
    writeFileSync(DEFAULT_SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`Wrote ${states.length} states from ${ref} (${commit.slice(0, 7)}) to data/deposit-laws.json.`);
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
