/** Vite's `?raw` import: the repertoire and plugin definitions reach the binding as strings. */
declare module "*.yaml?raw" {
  const yaml: string;
  export default yaml;
}
