export interface EdgeResolveDepths {
  outgoing: number;
}

/** @todo - Add documentation */
export type GraphResolveDepths = {
  constrainsLinkDestinationsOn: EdgeResolveDepths;
  constrainsLinksOn: EdgeResolveDepths;
  constrainsPropertiesOn: EdgeResolveDepths;
  constrainsValuesOn: EdgeResolveDepths;
  inheritsFrom: EdgeResolveDepths;
  isOfType: EdgeResolveDepths;
};
