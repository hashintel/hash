import { resolve } from "node:path";

import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";
import { TSDocConfigFile } from "@microsoft/tsdoc-config";

const root = resolve(import.meta.dirname, "..");
const configPath = resolve(root, "api-extractor.json");
const config = ExtractorConfig.prepare({
  configObject: ExtractorConfig.loadFile(configPath),
  configObjectFullPath: configPath,
  packageJsonFullPath: resolve(root, "../typescript/package.json"),
  tsdocConfigFile: TSDocConfigFile.loadFile(resolve(root, "tsdoc.json")),
});
const result = Extractor.invoke(config, { localBuild: true });
if (!result.succeeded) {
  process.exitCode = 1;
}
