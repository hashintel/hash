require("ts-node").register({
  transpileOnly: false,
  require: ["dotenv-flow/config"],
});
require("../src/singer-target.ts");
