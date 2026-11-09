/**
 * The 5 test questions and their ground truth, shared by the regex check (check.ts)
 * and AgentCore Evaluations (evaluate.ts, step 9).
 *
 * Ground truth comes from the deposit-law tool results (propinspect.net guides), not memory.
 * Tool names are as the agent sees them through the gateway: "<target>___<tool>".
 */
export interface Case {
  id: string;
  question: string;
  /** Regex check (check.ts). */
  mustMatch: RegExp[];
  mustNotMatch?: RegExp[];
  tools: RegExp;
  /** Ground truth for Evaluations: the answer we expect, in plain words (Builtin.Correctness). */
  expectedResponse: string;
  /** Statements that must hold for the whole session (Builtin.GoalSuccessRate). */
  assertions: string[];
  /** Tools that must be called, any order (Builtin.TrajectoryAnyOrderMatch). */
  expectedTools: string[];
}

const DISCLAIMER = /not legal advice/i;
const T = (name: string) => `deposit-laws___${name}`;
const CITE_AND_DISCLAIM = [
  "The answer cites a propinspect.net security deposit guide link and its review date.",
  "The answer says it is general information, not legal advice.",
];

export const CASES: Case[] = [
  {
    id: "wa-deadline",
    question: "What's the deposit return deadline in Washington?",
    mustMatch: [/30 days/i, /propinspect\.net\/security-deposit-laws\/washington/, DISCLAIMER],
    tools: /get_deposit_rules/,
    expectedResponse:
      "In Washington the landlord has 30 days after the tenancy ends and the tenant moves out to return the deposit and send a statement of anything kept. Source: the propinspect.net Washington guide.",
    assertions: ["The agent looked up Washington's rules with a tool.", "The answer gives 30 days as the deadline.", ...CITE_AND_DISCLAIM],
    expectedTools: [T("get_deposit_rules")],
  },
  {
    id: "nv-cap",
    question: "What's the most a landlord in Nevada can charge as a security deposit?",
    mustMatch: [/3 months/i, /propinspect\.net\/security-deposit-laws\/nevada/, DISCLAIMER],
    tools: /get_deposit_rules/,
    expectedResponse:
      "In Nevada the security deposit can be at most 3 months' rent. Source: the propinspect.net Nevada guide.",
    assertions: ["The agent looked up Nevada's rules with a tool.", "The answer gives a cap of 3 months' rent.", ...CITE_AND_DISCLAIM],
    expectedTools: [T("get_deposit_rules")],
  },
  {
    id: "ca-vs-tx",
    question: "Compare the deposit return deadlines in California and Texas.",
    mustMatch: [/security-deposit-laws\/california/, /security-deposit-laws\/texas/, DISCLAIMER],
    tools: /compare_states|get_deposit_rules/,
    expectedResponse:
      "California: 21 days after the tenant moves out. Texas: 30 days after the tenant surrenders the premises (the tenant must give a forwarding address). Sources: the propinspect.net California and Texas guides.",
    assertions: [
      "The answer gives 21 days for California and 30 days for Texas.",
      "The answer cites both the California and the Texas guide.",
      "The answer says it is general information, not legal advice.",
    ],
    // compare_states is blocked by the step 8 policy, so the agent looks up each state.
    expectedTools: [T("get_deposit_rules")],
  },
  {
    id: "covered-states",
    question: "Which states can you answer deposit questions for?",
    mustMatch: [/50/],
    tools: /list_covered_states/,
    expectedResponse: "All 50 US states are covered. Washington DC and US territories are not.",
    assertions: ["The agent listed the covered states with a tool.", "The answer says all 50 states are covered."],
    expectedTools: [T("list_covered_states")],
  },
  {
    id: "dc-not-covered",
    question: "What's the security deposit return deadline in Washington DC?",
    mustMatch: [/\b(not|isn't|is not|aren't)\s+covered\b/i],
    mustNotMatch: [/\b\d+\s*(business\s+)?days\b/i],
    tools: /get_deposit_rules/,
    expectedResponse: "Washington DC is not covered by these guides, so no deadline can be given.",
    assertions: [
      "The answer says plainly that Washington DC is not covered.",
      "The answer does not give any deadline or number of days for Washington DC.",
    ],
    expectedTools: [T("get_deposit_rules")],
  },
];
