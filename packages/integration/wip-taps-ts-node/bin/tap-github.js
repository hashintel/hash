require("ts-node").register({
  transpileOnly: false,
  require: ["dotenv-flow/config"],
});

require("../bootstrapCLITap.ts").bootstrapCLITap(
  require("../src/github/github.ts").github,
);
