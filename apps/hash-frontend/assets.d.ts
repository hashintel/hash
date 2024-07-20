declare module "*.svg" {
  const ReactComponent: FunctionComponent<SVGProps<SVGSVGElement>>;

   
  export default ReactComponent;
}

declare module "*.wasm" {
  const content: string;

   
  export default content;
}

declare module "*.woff";
declare module "*.ttf";
