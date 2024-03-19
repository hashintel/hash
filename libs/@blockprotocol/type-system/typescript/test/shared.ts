import * as fs from "node:fs/promises";

import wasm from "@blockprotocol/type-system-rs/type-system.wasm?url";

import { TypeSystemInitializer } from "../src/main";

export async function initialize() {
  // every bundler handles WASM files differently (don't ask me why) so it's a huge pain
  // to actually get working. This is a hack where we load the wasm file from the FS instead
  // of doing that automatically.
  // In theory WASM could do this, but wasm-pack hasn't implemented file based loading yet.
  if (typeof wasm !== "string") {
    throw new Error("Function hasn't been executed with vitest.");
  }

  const opaque = wasm as unknown as string;

  const buffer = await fs.readFile(opaque.substring(4));
  const arrayBuffer = buffer.buffer;

  await TypeSystemInitializer.initialize(arrayBuffer);
}
