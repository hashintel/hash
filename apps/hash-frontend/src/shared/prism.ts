import Prism from "prismjs";

const globalWithPrism = globalThis as typeof globalThis & {
  Prism: typeof Prism;
};

globalWithPrism.Prism = Prism;

await import("prismjs/components/prism-javascript");
await import("prismjs/components/prism-json");
await import("prismjs/components/prism-json5");
await import("prismjs/components/prism-markdown");
await import("prismjs/components/prism-python");
await import("prismjs/components/prism-rust");
await import("prismjs/components/prism-typescript");

export { Prism };
