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

      if (sdcpn.types.some((type) => type.id === id)) {
        return "type";
      }

      if (sdcpn.parameters.some((parameter) => parameter.id === id)) {
        return "parameter";
      }

      if (sdcpn.differentialEquations.some((equation) => equation.id === id)) {
        return "differentialEquation";
      }

      if (sdcpn.places.some((place) => place.id === id)) {
        return "place";
      }

      if (sdcpn.transitions.some((transition) => transition.id === id)) {
        return "transition";
      }

      return null;
    },
  };

  return (
    <SDCPNContext.Provider value={value}>{children}</SDCPNContext.Provider>
  );
};
