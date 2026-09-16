/** Vite's `?raw` imports ship authored prompt material inside the bundle. */
declare module "*.md?raw" {
  const markdown: string;
  export default markdown;
}
