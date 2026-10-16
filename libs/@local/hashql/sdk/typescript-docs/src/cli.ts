// oxlint-disable effecttsgo/unstable-api-usage -- CLI module is unstable
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect/cli";

import * as Analyze from "./Analyze.js";
import * as Transform from "./Transform.js";

const command = Command.make("docs").pipe(
  Command.withSubcommands([Analyze.handler, Transform.handler]),
);

Command.run(command, { version: "0.0.1" }).pipe(
  // oxlint-disable-next-line effecttsgo/strict-effect-provide -- entrypoint
  Effect.provide(NodeServices.layer),
  // oxlint-disable-next-line typescript/strict-void-return -- false positive
  NodeRuntime.runMain,
);
