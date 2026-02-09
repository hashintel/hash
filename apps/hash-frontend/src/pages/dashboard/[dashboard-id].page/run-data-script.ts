/**
 * Runs a dashboard data script with vertices (data), params, and helpers in scope.
 * Script body has access to: data (vertices), params, processVerticesIntoFlights, processFlightData.
 */
import type { DataScript } from "../shared/types";
import { processVerticesIntoFlights } from "./dummy-data";
import { processFlightData } from "./generate-dashboard-items";

export function runDataScript(
  rawData: unknown,
  dataScript: DataScript,
  scriptParams: Record<string, string>,
): unknown[] {
  const script = dataScript.script;
  if (!script || typeof script !== "string") {
    return [];
  }

  const paramsWithNow = {
    ...scriptParams,
    now: new Date().toISOString(),
  };

  try {
    const fn = new Function(
      "data",
      "params",
      "processVerticesIntoFlights",
      "processFlightData",
      `return (function(data, params, processVerticesIntoFlights, processFlightData) { ${script} })(data, params, processVerticesIntoFlights, processFlightData);`,
    );
    const result = fn(
      rawData,
      paramsWithNow,
      processVerticesIntoFlights,
      processFlightData,
    );
    return Array.isArray(result) ? result : [];
  } catch (err) {
    throw err;
  }
}
