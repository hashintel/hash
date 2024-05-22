import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import type { InferFactsFromWebPageWorkerAgentState } from "./infer-facts-from-web-page-worker-agent/types";

const directoryPath = "./persisted-states";

export const writeStateToFile = (
  state: InferFactsFromWebPageWorkerAgentState,
) => {
  const filePath = `${directoryPath}/${new Date().getTime()}-state.json`;
  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(state, null, 2));
};

export const retrievePreviousState =
  (): InferFactsFromWebPageWorkerAgentState => {
    if (!existsSync(directoryPath)) {
      throw new Error("No persisted state directory found.");
    }

    const files = readdirSync(directoryPath);
    if (files.length === 0) {
      throw new Error("No state files found in the directory.");
    }

    const latestFile = files[files.length - 1];

    const latestFilePath = `${directoryPath}/${latestFile}`;
    const latestFileContent = readFileSync(latestFilePath, "utf8");

    return JSON.parse(
      latestFileContent,
    ) as InferFactsFromWebPageWorkerAgentState;
  };
