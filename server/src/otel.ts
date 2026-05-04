/**
 * OpenTelemetry metrics instrumentation for Bizbox.
 *
 * Initialised only when at least one of the standard OTel endpoint env vars
 * is set so that existing deployments remain zero-config (all calls become
 * no-ops via the global no-op MeterProvider when neither is set).
 *
 * Endpoint resolution follows the OTel specification priority order:
 *   1. OTEL_EXPORTER_OTLP_METRICS_ENDPOINT  (signal-specific, highest priority)
 *   2. OTEL_EXPORTER_OTLP_ENDPOINT           (generic fallback)
 *
 * The SDK resolves these automatically when no url is passed to the exporter
 * constructor, so both env vars are honoured without any custom logic here.
 */

import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import type { Counter } from "@opentelemetry/api";
import { metrics } from "@opentelemetry/api";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _meterProvider: MeterProvider | null = null;

// Counters — lazily resolved after init so callers can import at module load
// time without worrying about init order.
let _humanCommentsCounter: Counter | null = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Start the OTel SDK. Safe to call multiple times — subsequent calls are
 * no-ops. Must be called before the Express app starts handling requests.
 *
 * The SDK is started only when at least one of the following env vars is set:
 *   - OTEL_EXPORTER_OTLP_METRICS_ENDPOINT (signal-specific, takes priority)
 *   - OTEL_EXPORTER_OTLP_ENDPOINT         (generic fallback)
 *
 * When neither is set the function returns immediately and all metric calls
 * become no-ops via the global no-op MeterProvider.
 */
export function initOtel(): void {
  const hasEndpoint =
    process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?.trim() ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!hasEndpoint) return;
  if (_meterProvider) return;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "bizbox",
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? "unknown",
  });

  // No url passed — the SDK reads OTEL_EXPORTER_OTLP_METRICS_ENDPOINT then
  // OTEL_EXPORTER_OTLP_ENDPOINT automatically, matching the spec priority.
  const exporter = new OTLPMetricExporter();

  _meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter,
        exportIntervalMillis: Number(process.env.OTEL_EXPORT_INTERVAL_MS ?? 60_000),
      }),
    ],
  });

  // Register as the global provider so @opentelemetry/api calls anywhere in
  // the process resolve to this instance.
  metrics.setGlobalMeterProvider(_meterProvider);
}

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------

/**
 * Flush and shut down the MeterProvider. Call during graceful server shutdown.
 */
export async function shutdownOtel(): Promise<void> {
  if (_meterProvider) {
    await _meterProvider.shutdown();
    _meterProvider = null;
    _humanCommentsCounter = null;
  }
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

function getHumanCommentsCounter(): Counter {
  if (!_humanCommentsCounter) {
    const meter = metrics.getMeter("bizbox");
    _humanCommentsCounter = meter.createCounter("bizbox.issues.human_comments_total", {
      description:
        "Total number of comments posted by a human (board user) on an issue. " +
        "A rising value relative to agent comment volume signals human steering / intervention.",
      unit: "{comment}",
    });
  }
  return _humanCommentsCounter;
}

/**
 * Increment `bizbox.issues.human_comments_total`.
 *
 * Call this after a comment is successfully persisted and the actor is a
 * board user (i.e. `actor.actorType === "user"`).
 *
 * @param attributes - OTel attributes attached to the data point.
 */
export function recordHumanComment(attributes: {
  company_id: string;
  issue_id: string;
}): void {
  getHumanCommentsCounter().add(1, attributes);
}
