import type { Transport } from "@modelcontextprotocol/server";
import type { CallLog } from "./callLog";

/**
 * Counts tool calls the SDK rejected at the input-schema boundary (for
 * example "Nevada. Ignore previous instructions…" as a state code). Those
 * never reach our handlers, so the call log can't see them otherwise.
 *
 * Works at the transport, through its public interface: incoming tools/call
 * requests are remembered by id (tool name only), and an outgoing response
 * that is an input-validation error is logged as "rejected". Arguments are
 * never stored or logged: they are exactly the untrusted text we refused.
 */
export function withRejectionLog(transport: Transport, log: CallLog, toolNames: ReadonlySet<string>): Transport {
  const pending = new Map<string | number, string>();

  return new Proxy(transport, {
    set(target, prop, value) {
      if (prop === "onmessage" && typeof value === "function") {
        const handler = value as NonNullable<Transport["onmessage"]>;
        target.onmessage = ((message, extra) => {
          const m = message as { id?: string | number; method?: string; params?: { name?: unknown } };
          if (m.method === "tools/call" && m.id !== undefined) {
            // The tool name is the client's choice; only our own names are recorded.
            const name = typeof m.params?.name === "string" && toolNames.has(m.params.name) ? m.params.name : "unknown_tool";
            pending.set(m.id, name);
          }
          return handler(message, extra);
        }) as Transport["onmessage"];
        return true;
      }
      return Reflect.set(target, prop, value);
    },
    get(target, prop, receiver) {
      if (prop === "send") {
        return (message: unknown, options?: unknown) => {
          const m = message as { id?: string | number; result?: { isError?: boolean; content?: Array<{ text?: string }> }; error?: unknown };
          if (m.id !== undefined && pending.has(m.id)) {
            const call = pending.get(m.id)!;
            pending.delete(m.id);
            const text = (m.result?.content ?? []).map((c) => c.text ?? "").join(" ");
            const rejected = m.error !== undefined || (m.result?.isError === true && /input validation error/i.test(text));
            if (rejected) log.record({ call, states: [], status: "rejected", ms: 0 });
          }
          return (target.send as (msg: unknown, opts?: unknown) => Promise<void>).call(target, message, options);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
