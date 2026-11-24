import { resolveComponent } from "@hashintel/petrinaut-core";

import type {
  ArcEndpoint,
  ComponentInstance,
  Place,
  ResolvedLibraries,
  SDCPN,
} from "@hashintel/petrinaut-core";

/**
 * The instance a port endpoint names, the component it instantiates and the
 * port place inside it. Each is `undefined` where the net no longer has it.
 */
export const resolvePort = (
  endpoint: Extract<ArcEndpoint, { kind: "componentPort" }>,
  net: Pick<SDCPN, "componentInstances">,
  sdcpn: SDCPN,
  libraries: ResolvedLibraries,
) => {
  const instance = net.componentInstances?.find(
    ({ id }) => id === endpoint.componentInstanceId,
  );
  const component = instance
    ? resolveComponent(sdcpn, instance.component, libraries)
    : undefined;
  const port = component?.places.find(
    (place) => place.id === endpoint.portPlaceId,
  );
  return { instance, component, port };
};

/** How a panel names a port, with a stand-in for a part that is missing. */
export const portLabel = ({
  instance,
  port,
}: {
  instance: ComponentInstance | undefined;
  port: Place | undefined;
}): string =>
  `${instance?.name ?? "Unknown component"}.${port?.name ?? "Unknown port"}`;
