/** Vite's `?raw` import: the plugin definition ships inside the bundle as a string. */
declare module "*.yaml?raw" {
  const yaml: string;
  export default yaml;
}
