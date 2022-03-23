import type { Tap, TapConfig } from "./src/_utils/createTap.function";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { inspect } from "util";

export function bootstrapCLITap(tap: Tap<TapConfig>) {
  // not implemented
  start().catch((err) => {
    console.error(`Error running tap for ${tap.name}:`, err);
    console.error("");
    showHelp(tap);
  });
}

async function start() {
  throw "Not implemented";
}

function showHelp({ name, tap }: Tap<TapConfig>) {
  console.error(`${name} usage:\n`);
  if (tap.configType) {
    console.error(`--config=${name}-config.json\n`);
    eprintZodAsSchema(tap.configType);
  }

  if (tap.stateType) {
    console.error(`--state=${name}-config.json\n`);
    eprintZodAsSchema(tap.stateType);
  }
}

function eprintZodAsSchema(zodType: z.ZodType<any>) {
  console.error(
    indentBy(
      "    ",
      inspect(zodToJsonSchema(zodType), undefined, Infinity, true),
    ),
  );
  console.error("");
}

function indentBy(by: string, source: string) {
  return source.replace(/^(.)/gm, `${by}$1`);
}
