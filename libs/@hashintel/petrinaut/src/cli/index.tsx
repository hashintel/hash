#!/usr/bin/env node
/* eslint-disable no-console -- CLI startup failures should be visible. */
import { render } from "ink";

import { PetrinautCliApp } from "./app";
import { loadPetrinautExamples } from "./examples";

try {
  const examples = await loadPetrinautExamples();
  const instance = render(<PetrinautCliApp examples={examples} />, {
    exitOnCtrlC: false,
    maxFps: 30,
  });

  await instance.waitUntilExit();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
