import { z } from "zod";

/**
 * The data contract between the PropInspect app (the source of truth) and
 * this server. The export script validates against it before writing the
 * snapshot, and the loader validates against it again at startup, so both
 * sides of the pipeline check the same contract.
 *
 * Facts only: the long-form guide text stays on propinspect.net, and every
 * answer links there.
 */

export const SCHEMA_VERSION = 1;

const nonEmpty = z.string().trim().min(1);

export const GUIDE_URL_PREFIX = "https://propinspect.net/security-deposit-laws/";

export const StateFactsSchema = z.object({
  state: nonEmpty,
  stateCode: z.string().regex(/^[A-Z]{2}$/, "must be a two-letter uppercase code"),
  slug: z.string().regex(/^[a-z]+(-[a-z]+)*$/, "must be a lowercase slug"),
  url: z.string().startsWith(GUIDE_URL_PREFIX),
  /** ISO date (YYYY-MM-DD). The export normalizes the source's mixed formats. */
  lastReviewed: z.iso.date(),
  statute: z.object({
    name: nonEmpty,
    url: z.url(),
  }),
  comparison: z.object({
    depositCap: nonEmpty,
    returnDeadline: nonEmpty,
    wrongfulWithholdingPenalty: nonEmpty,
    moveInRecordRule: nonEmpty,
    scope: nonEmpty.optional(),
  }),
  summary: z.array(z.object({ label: nonEmpty, rule: nonEmpty })).min(1),
  references: z
    .array(
      z.object({
        label: nonEmpty,
        url: z.url(),
        type: z.enum(["statute", "bill", "legislative-analysis", "official-guide"]),
      }),
    )
    .min(1),
  faqs: z.array(z.object({ question: nonEmpty, answer: nonEmpty })),
  disclaimer: nonEmpty,
});

export const SnapshotSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  source: z.object({
    file: nonEmpty,
    commit: z.string().regex(/^[0-9a-f]{40}$/, "must be a full git commit hash"),
  }),
  exportedAt: z.iso.datetime(),
  count: z.number().int().positive(),
  states: z.array(StateFactsSchema),
});

export type StateFacts = z.infer<typeof StateFactsSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
