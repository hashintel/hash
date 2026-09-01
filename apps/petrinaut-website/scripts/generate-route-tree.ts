import { fileURLToPath } from "node:url";

import { Generator, getConfig } from "@tanstack/router-generator";

import { routerCodegenConfig } from "../router-codegen-config.ts";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const config = getConfig(routerCodegenConfig, appRoot);

await new Generator({ config, root: appRoot }).run();
