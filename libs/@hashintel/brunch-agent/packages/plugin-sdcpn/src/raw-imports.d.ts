/** Vite's `?raw` import: the plugin file ships inside the bundle as a string. */
declare module "*.md?raw" {
  const markdown: string;
  export default markdown;
}
