/** Send buffered spans before the process exits; a no-op when no tracer provider is registered. */
import { trace } from "@opentelemetry/api";

export async function flushTelemetry(): Promise<void> {
  const proxy = trace.getTracerProvider() as { getDelegate?: () => unknown };
  const provider = (proxy.getDelegate?.() ?? proxy) as { forceFlush?: () => Promise<void> };
  await provider.forceFlush?.();
}
