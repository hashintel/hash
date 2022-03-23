require("ts-node").register({ transpileOnly: false });
require("../bootstrapCLITap.ts").bootstrapCLITap(
  require("../src/github/github.ts").github,
);
