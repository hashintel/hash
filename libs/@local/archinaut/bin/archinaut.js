#!/usr/bin/env node
// The CLI and the config files it loads are TypeScript; tsx compiles them on
// the fly so nothing has to be built before the tool can run.
import { tsImport } from "tsx/esm/api";

await tsImport("../src/cli.ts", import.meta.url);
