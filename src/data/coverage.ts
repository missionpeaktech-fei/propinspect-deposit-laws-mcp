/**
 * The states this server promises to answer: all 50 US states.
 *
 * This is the consumer's side of the contract with the PropInspect app, so
 * it is written out here, not imported from the app. The loader checks every
 * snapshot against it: a snapshot that silently lost a state fails at
 * startup instead of answering "not covered" for a state we do cover, and a
 * new jurisdiction (e.g. DC) is rejected until someone decides to cover it.
 *
 * Changing this list is a product decision: update the tool descriptions and
 * the README with it.
 */
export const COVERED_STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

export type CoveredStateCode = (typeof COVERED_STATE_CODES)[number];
