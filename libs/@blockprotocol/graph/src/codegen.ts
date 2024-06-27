/**
 * Defines utilities for generating TypeScript types from elements of the Block Protocol Type System.
 */
import * as path from "node:path";

import { compile } from "./codegen/compile";
import {
  CompileContext,
  InitializeContext,
  PostprocessContext,
  PreprocessContext,
} from "./codegen/context";
import { initialize } from "./codegen/initialize";
import type { CodegenParameters } from "./codegen/parameters";
import { postprocess } from "./codegen/postprocess";
import { preprocess } from "./codegen/preprocess";
import type { LogLevel } from "./codegen/shared";

export {
  type CodegenParameters,
  validateCodegenParameters,
} from "./codegen/parameters";

export const codegen = async (
  params: CodegenParameters,
  logLevel: LogLevel = "info",
): Promise<string[]> => {
  const initializeContext = new InitializeContext(params, logLevel);
  await initialize(initializeContext);

  const preProcessContext = new PreprocessContext(initializeContext);
  preprocess(preProcessContext);

  const compileContext = new CompileContext(preProcessContext);
  await compile(compileContext);

  const postProcessContext = new PostprocessContext(compileContext);
  await postprocess(postProcessContext);

  // Return all modified files
  return Object.keys(postProcessContext.filesToContents).map((fileName) =>
    path.resolve(postProcessContext.parameters.outputFolder, fileName),
  );
};
