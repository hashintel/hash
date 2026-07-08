import { readFile } from "node:fs/promises";

import { parseSDCPNFile } from "@hashintel/petrinaut-core";

import type { SDCPN } from "@hashintel/petrinaut-core";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRawSdcpn(value: unknown): SDCPN | null {
  if (!isObject(value)) {
    return null;
  }
  if (!Array.isArray(value.places) || !Array.isArray(value.transitions)) {
    return null;
  }

  return {
    places: value.places as SDCPN["places"],
    transitions: value.transitions as SDCPN["transitions"],
    types: Array.isArray(value.types) ? (value.types as SDCPN["types"]) : [],
    differentialEquations: Array.isArray(value.differentialEquations)
      ? (value.differentialEquations as SDCPN["differentialEquations"])
      : [],
    parameters: Array.isArray(value.parameters)
      ? (value.parameters as SDCPN["parameters"])
      : [],
    scenarios: Array.isArray(value.scenarios)
      ? (value.scenarios as SDCPN["scenarios"])
      : [],
    metrics: Array.isArray(value.metrics)
      ? (value.metrics as SDCPN["metrics"])
      : [],
    subnets: Array.isArray(value.subnets)
      ? (value.subnets as SDCPN["subnets"])
      : [],
    componentInstances: Array.isArray(value.componentInstances)
      ? (value.componentInstances as SDCPN["componentInstances"])
      : [],
  };
}

export async function loadSdcpnModel(path: string): Promise<SDCPN> {
  const text = await readFile(path, "utf8");
  const data: unknown = JSON.parse(text);
  const parsed = parseSDCPNFile(data);
  if (parsed.ok) {
    return parsed.sdcpn;
  }

  const raw = parseRawSdcpn(data);
  if (raw) {
    return raw;
  }

  throw new Error(parsed.error);
}
