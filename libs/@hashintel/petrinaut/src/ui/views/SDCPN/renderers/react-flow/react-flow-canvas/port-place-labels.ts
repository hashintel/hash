import type { PortDirection } from "@hashintel/petrinaut-core";

/** What a port place calls itself under its name. */
export const portPlaceLabels: Record<PortDirection, string> = {
  in: "Input port",
  out: "Output port",
  inout: "Port",
};
