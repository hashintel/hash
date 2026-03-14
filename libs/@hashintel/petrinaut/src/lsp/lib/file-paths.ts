/**
 * Centralized file path generation for SDCPN virtual files.
 * All paths are absolute (start with `/`) to work with TypeScript's baseUrl configuration.
 *
 * When `language` is "python", paths use `.py` / `.pyi` extensions instead of `.ts` / `.d.ts`.
 */

import type { SDCPNLanguage } from "../../core/types/sdcpn";

export type SDCPNFileType =
  | "sdcpn-lib-defs"
  | "parameters-defs"
  | "color-defs"
  | "differential-equation-defs"
  | "differential-equation-code"
  | "transition-lambda-defs"
  | "transition-lambda-code"
  | "transition-kernel-defs"
  | "transition-kernel-code";

type FilePathParams = {
  "sdcpn-lib-defs": Record<string, never>;
  "parameters-defs": Record<string, never>;
  "color-defs": { colorId: string };
  "differential-equation-defs": { id: string };
  "differential-equation-code": { id: string };
  "transition-lambda-defs": { transitionId: string };
  "transition-lambda-code": { transitionId: string };
  "transition-kernel-defs": { transitionId: string };
  "transition-kernel-code": { transitionId: string };
};

/**
 * Generates an absolute file path for SDCPN virtual files.
 *
 * @param fileType - The type of file to generate a path for
 * @param params - Parameters required for the specific file type
 * @param language - "typescript" (default) or "python" — determines file extensions
 * @returns Absolute path starting with `/`
 */
export const getItemFilePath = <T extends SDCPNFileType>(
  fileType: T,
  ...args: FilePathParams[T] extends Record<string, never>
    ? [undefined?, SDCPNLanguage?]
    : [FilePathParams[T], SDCPNLanguage?]
): string => {
  const params = args[0] as FilePathParams[T] | undefined;
  const language: SDCPNLanguage =
    (args[1] as SDCPNLanguage | undefined) ?? "typescript";

  const defsExt = language === "python" ? ".pyi" : ".d.ts";
  const codeExt = language === "python" ? ".py" : ".ts";

  switch (fileType) {
    case "sdcpn-lib-defs":
      return `/sdcpn-lib${defsExt}`;

    case "parameters-defs":
      return `/parameters/defs${defsExt}`;

    case "color-defs": {
      const { colorId } = params as FilePathParams["color-defs"];
      return `/colors/${colorId}/defs${defsExt}`;
    }

    case "differential-equation-defs": {
      const { id } = params as FilePathParams["differential-equation-defs"];
      return `/differential_equations/${id}/defs${defsExt}`;
    }

    case "differential-equation-code": {
      const { id } = params as FilePathParams["differential-equation-code"];
      return `/differential_equations/${id}/code${codeExt}`;
    }

    case "transition-lambda-defs": {
      const { transitionId } =
        params as FilePathParams["transition-lambda-defs"];
      return `/transitions/${transitionId}/lambda/defs${defsExt}`;
    }

    case "transition-lambda-code": {
      const { transitionId } =
        params as FilePathParams["transition-lambda-code"];
      return `/transitions/${transitionId}/lambda/code${codeExt}`;
    }

    case "transition-kernel-defs": {
      const { transitionId } =
        params as FilePathParams["transition-kernel-defs"];
      return `/transitions/${transitionId}/kernel/defs${defsExt}`;
    }

    case "transition-kernel-code": {
      const { transitionId } =
        params as FilePathParams["transition-kernel-code"];
      return `/transitions/${transitionId}/kernel/code${codeExt}`;
    }

    default:
      throw new Error(`Unknown file type: ${fileType}`);
  }
};
