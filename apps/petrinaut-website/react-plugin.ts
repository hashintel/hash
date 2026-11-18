import react from "@vitejs/plugin-react";

/**
 * The React plugin with the React Compiler, shared by the app build and the
 * unit tests so tests exercise the compiled components that ship.
 */
export const websiteReactPlugin = () =>
  react({
    // @hashintel/ds-components ships prebuilt jsx() calls; the compiler
    // can't recognize ref forwarding in that form and bails with
    // "Cannot access refs during render". Opt that package out.
    exclude: [
      /[\\/]node_modules[\\/]/,
      /[\\/]libs[\\/]@hashintel[\\/]ds-components[\\/]/,
    ],
    compiler: {
      target: "19",
      compilationMode: "infer",
      panicThreshold: "all_errors",
    },
  });
