import { readFileSync, writeFileSync } from "fs";
import { toPanda } from "./lib/toPanda";

const inputPath = process.argv[2];
const inputContent = JSON.parse(readFileSync(inputPath, "utf-8"));

const outputPath = "./src/index.ts";
const { preset, nameMap } = toPanda(inputContent);

// Write preset output file

const fileContent = `import { definePreset } from "@pandacss/dev";
export default definePreset(${JSON.stringify(preset, null, 2)});
`;

writeFileSync(outputPath, fileContent, "utf-8");

// Write name map output file
const nameMapOutputPath = "./src/figmaToPandaNameMap.json";
writeFileSync(nameMapOutputPath, JSON.stringify(nameMap, null, 2), "utf-8");
