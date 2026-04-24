import {
  createNodeSpecifierResolver,
  createPetrinautPandaConfig,
  resolveDsComponentsBuildInfoPath,
} from "./panda.config.shared";

export default createPetrinautPandaConfig(
  resolveDsComponentsBuildInfoPath(
    /** Panda evaluates this config through CJS, so `__filename` is available here. */
    createNodeSpecifierResolver(__filename),
  ),
);
