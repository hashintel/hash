declare module "*.svg" {
  const ReactComponent: React.FC<React.SVGProps<SVGSVGElement>>;
  // eslint-disable-next-line import/no-default-export -- third-party requirement
  export default ReactComponent;
}
