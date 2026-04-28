declare module "*.css" {}
declare module "*.svg" {
  import type { FunctionComponent, SVGAttributes } from "react";
  const ReactComponent: FunctionComponent<SVGAttributes<SVGElement>>;
  export default ReactComponent;
}
declare module "@fontsource/*" {}
declare module "@fontsource-variable/*" {}
