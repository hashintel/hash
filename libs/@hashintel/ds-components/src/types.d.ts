/* eslint-disable import/no-default-export */
declare module "*.svg" {
  import type { FunctionComponent, SVGAttributes } from "react";

  const ReactComponent: FunctionComponent<SVGAttributes<SVGElement>>;
  export default ReactComponent;
}
