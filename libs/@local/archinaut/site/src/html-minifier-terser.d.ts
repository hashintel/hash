/** The part of html-minifier-terser the deck export calls; the package ships no types. */
declare module "html-minifier-terser" {
  export const minify: (
    html: string,
    options?: Record<string, boolean>,
  ) => Promise<string>;
}
