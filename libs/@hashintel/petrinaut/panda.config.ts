import { resolvePandaBuildInfoPath } from "@hashintel/ds-components/preset";

import {
  createNodeSpecifierResolver,
  createPetrinautPandaConfig,
  DS_COMPONENTS_BUILD_INFO_SUBPATH,
} from "./panda.config.shared";

export default createPetrinautPandaConfig(
  resolvePandaBuildInfoPath(
    DS_COMPONENTS_BUILD_INFO_SUBPATH,
    /** Panda evaluates this config through CJS, so `__filename` is available here. */
    createNodeSpecifierResolver(__filename),
  ),
);
