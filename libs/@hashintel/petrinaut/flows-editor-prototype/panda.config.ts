import petrinautConfig from "../panda.config";

/**
 * Petrinaut's Panda config, also scanning the prototype's own files, which
 * sit outside the package's `src`.
 */
export default {
  ...petrinautConfig,
  include: [
    ...(petrinautConfig.include ?? []),
    "./flows-editor-prototype/main.tsx",
    "./flows-editor-prototype/src/**/*.{ts,tsx}",
  ],
};
