/**
 * Side-effect entry the application module imports first, so the exporters
 * exist by the time Flue asks the OpenTelemetry globals for its tracer and
 * meter.
 */

import { installBrunchTelemetry } from "./telemetry.ts";

// Awaited so an unreachable development collector is dropped before Flue
// reads the OpenTelemetry globals; `db.ts` already awaits at module level.
const disposeTelemetry = await installBrunchTelemetry();

/**
 * Flushes and shuts the exporters down. The Postgres runner's close hook calls
 * it during a normal shutdown; a failed startup calls it before the process
 * exits.
 */
export const shutdownBrunchTelemetry = (): Promise<void> => disposeTelemetry();
