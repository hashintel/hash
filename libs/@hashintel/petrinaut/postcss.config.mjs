import panda from "@pandacss/dev/postcss";

import boostPandaSpecificity from "./scripts/boost-panda-specificity.mjs";

export default {
  plugins: [panda(), boostPandaSpecificity()],
};
