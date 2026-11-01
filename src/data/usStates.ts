/**
 * The 50 US state codes, written out by hand on purpose.
 *
 * This list does not come from the snapshot. The loader checks the snapshot
 * against it, so a snapshot that silently lost or duplicated a state fails
 * at startup instead of answering "not covered" for a state we do cover.
 */
export const US_STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

export type UsStateCode = (typeof US_STATE_CODES)[number];
