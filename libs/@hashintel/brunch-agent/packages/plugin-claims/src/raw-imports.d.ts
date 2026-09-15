/** Vite's `?raw` imports ship authored resources inside the bundle. */
declare module "*.md?raw" {
  const markdown: string;
  export default markdown;
}
