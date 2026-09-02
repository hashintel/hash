/**
 * Side-effect entry imported before application and database dependencies.
 *
 * Keeping the install in one module ensures the generated Flue server owns one
 * registration while the database entry can emit startup failures through the
 * same provider.
 */

import { installBrunchTelemetry } from "./telemetry.ts";

const disposeTelemetry = installBrunchTelemetry();

/**
 * The Postgres adapter invokes this from its generated-lifecycle close hook.
 * The disposer is idempotent if Flue also owns the registration directly.
 */
export const shutdownBrunchTelemetry = (): Promise<void> => disposeTelemetry();
