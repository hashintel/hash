import {
  ARC_ID_PREFIX,
  SDCPNContext,
  type SDCPNContextValue,
  type SDCPNProviderProps,
} from "./sdcpn-context";

export const SDCPNProvider: React.FC<
  React.PropsWithChildren<SDCPNProviderProps>
> = ({ children, ...rest }) => {
  const value: SDCPNContextValue = {
    ...rest,
    getItemType(id) {
      const sdcpn = rest.petriNetDefinition;

      // TODO: Selection and elements IDs should be reworked
      if (id.startsWith(ARC_ID_PREFIX)) {
        return "arc";
      }

      // Search root net and all subnets
      const nets = [sdcpn, ...(sdcpn.subnets ?? [])];

      for (const net of nets) {
        if (net.types.some((type) => type.id === id)) {
          return "type";
        }

        if (net.parameters.some((parameter) => parameter.id === id)) {
          return "parameter";
        }

        if (net.differentialEquations.some((equation) => equation.id === id)) {
          return "differentialEquation";
        }

        if (net.places.some((place) => place.id === id)) {
          return "place";
        }

        if (net.transitions.some((transition) => transition.id === id)) {
          return "transition";
        }
      }

      return null;
    },
  };

  return (
    <SDCPNContext.Provider value={value}>{children}</SDCPNContext.Provider>
  );
};
