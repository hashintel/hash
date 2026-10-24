/**
 * The chat's user guide imports its Markdown with Vite's `?raw` suffix. This
 * declares that one form for hosts that type-check `./ui` without Vite's
 * client types.
 */
declare module "*.md?raw" {
  const content: string;
  export default content;
}
