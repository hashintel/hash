declare module "*.svg" {
  const ReactComponent: FunctionComponent<SVGProps<SVGSVGElement>>;
  // eslint-disable-next-line import/no-default-export -- third-party requirement
  export default ReactComponent;
}

declare module "*.wasm" {
  const content: string;
  // eslint-disable-next-line import/no-default-export -- third-party requirement
  export default content;
}

declare module "*.woff";
declare module "*.ttf";
