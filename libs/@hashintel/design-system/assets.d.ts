declare module "*.svg" {
  const ReactComponent: FunctionComponent<SVGProps<SVGSVGElement>>;
  // eslint-disable-next-line import/no-default-export -- third-party requirement
  export default ReactComponent;
}

// The package ships no CSS types. Naming this file avoids accepting arbitrary CSS imports.
declare module "react-loading-skeleton/dist/skeleton.css" {}
