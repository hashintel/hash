/**
 * Centralized file path generation for SDCPN virtual TypeScript files.
 * All paths are absolute (start with `/`) to work with TypeScript's baseUrl configuration.
 */

export type SDCPNFileType =
  | "sdcpn-lib-defs"
  | "parameters-defs"
  | "color-defs"
  | "differential-equation-defs"
  | "differential-equation-code"
  | "transition-lambda-defs"
  | "transition-lambda-code"
  | "transition-kernel-defs"
  | "transition-kernel-code"
  | "scenario-session-defs"
  | "scenario-param-override-code"
  | "scenario-initial-state-code"
  | "scenario-initial-state-full-code";

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
  "scenario-session-defs": { sessionId: string };
  "scenario-param-override-code": { sessionId: string; paramId: string };
  "scenario-initial-state-code": { sessionId: string; placeId: string };
  "scenario-initial-state-full-code": { sessionId: string };
};

/**
 * Generates an absolute file path for SDCPN virtual TypeScript files.
 *
 * @param fileType - The type of file to generate a path for
 * @param params - Parameters required for the specific file type
 * @returns Absolute path starting with `/`
 */
export const getItemFilePath = <T extends SDCPNFileType>(
  fileType: T,
  ...args: FilePathParams[T] extends Record<string, never>
    ? []
    : [FilePathParams[T]]
): string => {
  const params = args[0];

  switch (fileType) {
    case "sdcpn-lib-defs":
      return "/sdcpn-lib.d.ts";

    case "parameters-defs":
      return "/parameters/defs.d.ts";

    case "color-defs": {
      const { colorId } = params as FilePathParams["color-defs"];
      return `/colors/${colorId}/defs.d.ts`;
    }

    case "differential-equation-defs": {
      const { id } = params as FilePathParams["differential-equation-defs"];
      return `/differential_equations/${id}/defs.d.ts`;
    }

    case "differential-equation-code": {
      const { id } = params as FilePathParams["differential-equation-code"];
      return `/differential_equations/${id}/code.ts`;
    }

    case "transition-lambda-defs": {
      const { transitionId } =
        params as FilePathParams["transition-lambda-defs"];
      return `/transitions/${transitionId}/lambda/defs.d.ts`;
    }

    case "transition-lambda-code": {
      const { transitionId } =
        params as FilePathParams["transition-lambda-code"];
      return `/transitions/${transitionId}/lambda/code.ts`;
    }

    case "transition-kernel-defs": {
      const { transitionId } =
        params as FilePathParams["transition-kernel-defs"];
      return `/transitions/${transitionId}/kernel/defs.d.ts`;
    }

    case "transition-kernel-code": {
      const { transitionId } =
        params as FilePathParams["transition-kernel-code"];
      return `/transitions/${transitionId}/kernel/code.ts`;
    }

    case "scenario-session-defs": {
      const { sessionId } = params as FilePathParams["scenario-session-defs"];
      return `/_temp/scenarios/${sessionId}/defs.d.ts`;
    }

    case "scenario-param-override-code": {
      const { sessionId, paramId } =
        params as FilePathParams["scenario-param-override-code"];
      return `/_temp/scenarios/${sessionId}/param_overrides/${paramId}/code.ts`;
    }

    case "scenario-initial-state-code": {
      const { sessionId, placeId } =
        params as FilePathParams["scenario-initial-state-code"];
      return `/_temp/scenarios/${sessionId}/initial_state/${placeId}/code.ts`;
    }

    case "scenario-initial-state-full-code": {
      const { sessionId } =
        params as FilePathParams["scenario-initial-state-full-code"];
      return `/_temp/scenarios/${sessionId}/initial_state_code/code.ts`;
    }

    default:
      throw new Error(`Unknown file type: ${fileType}`);
  }
};
