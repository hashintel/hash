/** @todo - This code shares a lot of similarities with the `status` package's codegen. These should be consolidated. */

import glob from "fast-glob";
import * as path from "node:path";
import { argv } from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import pascalcase from "pascalcase";

import dedent from "dedent";
import execa from "execa";
import yargs from "yargs";

const postProcess = async (files: string[]) => {
  const names = files.map((filePath) => {
    const parsedPath = path.parse(filePath);
    // Capitalize first letter
    const name = parsedPath.dir.split(path.sep).pop()!;
    const pascalName = pascalcase(name);

    // Remove extension from path for relative import
    const importPath = `${parsedPath.dir}/${parsedPath.name}`;

    return {
      importMapping: {
        Input: `${pascalName}Input`,
        Output: `${pascalName}Output`,
      },
      name,
      importPath,
    };
  });

  const objectMapping = (
    mapping: Record<string, string>,
    delimiter: string,
    postDelimiter: string = ", ",
  ) =>
    Object.entries(mapping)
      .map(([name, alias]) => `${name}${delimiter}${alias}`)
      .join(postDelimiter);

  const importLines = names
    .map(
      ({ importMapping, importPath }) =>
        `import {${objectMapping(
          importMapping,
          " as ",
        )}} from "../${importPath}";`,
    )
    .join("\n");

  const agentNames = dedent`
    export const agents = ["${names
      .map(({ name }) => name)
      .join('", "')}"] as const
    export type Agent = (typeof agents)[number];
    `;

  const ioMapping = names
    .map(
      ({ name, importMapping }) =>
        `{ ${objectMapping({ Agent: `"${name}"`, ...importMapping }, ": ")} }`,
    )
    .join("\n| ");

  const typeExport = dedent`
    export type AgentType =
      ${ioMapping}
    ;

    export type AgentTypeInput = Omit<AgentType, "Output">;
    export type AgentTypeOutput = Omit<AgentType, "Input">;
    `;

  const result = importLines + "\n\n" + agentNames + "\n\n" + typeExport;

  await mkdir("./src/", { recursive: true });
  const sharedModule = "./src/agents.ts";
  await writeFile(sharedModule, result);
  console.log(`Wrote shared type definitions to ${sharedModule}`);
};

/**
 *  @todo - Consider using `quicktype-core` and orchestrating ourselves from TS instead of calling
 *    the CLI (https://blog.quicktype.io/customizing-quicktype/)
 */
const codegen = async ({ globPattern }: { globPattern: string }) => {
  const files = await glob(globPattern);

  for await (const filePath of files) {
    console.log("Generating types from ", filePath);
    const fileName = path.parse(filePath).name;
    const fileExtension = path.extname(filePath);

    if (fileExtension === ".ts") {
      const outputPath = path.join(path.dirname(filePath), `${fileName}.py`);
      let { stdout } = await execa("quicktype", [
        "--lang",
        "schema",
        "--src",
        filePath,
      ]);

      await execa(
        "datamodel-codegen",
        [
          "--input-file-type",
          "jsonschema",
          "--output-model-type",
          "pydantic.BaseModel",
          "--output",
          outputPath,
        ],
        { input: stdout },
      );
    } else {
      throw new Error(`Unsupported quicktype input format: ${fileExtension}`);
    }
  }

  await postProcess(files.sort());
};

void (async () => {
  const args = yargs(argv.slice(2))
    .usage("Usage: $0 <glob>")
    .positional("glob", {
      describe: "Glob pointing to the files where TypeScript types are defined",
      type: "string",
      normalize: true,
    })
    .demandCommand(1)
    .help("h")
    .alias("h", "help")
    .parseSync();

  const [entryPointDir] = args._;

  console.log("Running codegen");
  await codegen({
    globPattern: entryPointDir as string,
  });
})();
