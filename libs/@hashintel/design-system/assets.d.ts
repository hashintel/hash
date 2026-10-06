declare module "*.svg" {
  const ReactComponent: FunctionComponent<SVGProps<SVGSVGElement>>;
  // eslint-disable-next-line import/no-default-export -- third-party requirement
  export default ReactComponent;
}

declare module "react-loading-skeleton/dist/skeleton.css" {}
