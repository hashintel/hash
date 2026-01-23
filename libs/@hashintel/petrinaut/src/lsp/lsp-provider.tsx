/**
 * LSP Provider Component.
 *
 * Creates and manages the LSP client lifecycle.
 * Re-initializes when SDCPN structure changes significantly.
 * Pushes incremental code updates for code-only changes.
 */

import { use, useEffect, useMemo, useRef, useState } from "react";

import { getItemFilePath } from "../core/checker/file-paths";
import type { SDCPN } from "../core/types/sdcpn";
import { SDCPNContext } from "../state/sdcpn-context";
import { LSPClient } from "./lsp-client";
import { LSPContext, type LSPContextValue } from "./lsp-context";

/**
 * Computes a structural hash of the SDCPN that changes when:
 * - Types/colors change (affects type definitions)
 * - Places change (affects arc types)
 * - Transitions change (affects input/output types)
 * - Parameters change (affects parameter types)
 *
 * Does NOT change when only code content changes.
 */
function computeStructuralHash(sdcpn: SDCPN): string {
  const parts: string[] = [];

  // Parameters structure
  parts.push(
    `params:${sdcpn.parameters
      .map((param) => `${param.id}:${param.variableName}:${param.type}`)
      .join(",")}`,
  );

  // Types/colors structure
  parts.push(
    `types:${sdcpn.types
      .map(
        (colorType) =>
          `${colorType.id}:${colorType.elements.map((elem) => `${elem.name}:${elem.type}`).join(";")}`,
      )
      .join(",")}`,
  );

  // Places structure (id, colorId, name for arc type generation)
  parts.push(
    `places:${sdcpn.places
      .map((place) => `${place.id}:${place.colorId ?? ""}:${place.name}`)
      .join(",")}`,
  );

  // Transitions structure (arcs, lambdaType)
  parts.push(
    `transitions:${sdcpn.transitions
      .map((transition) => {
        const inputs = transition.inputArcs
          .map((arc) => `${arc.placeId}:${arc.weight}`)
          .join(";");
        const outputs = transition.outputArcs
          .map((arc) => `${arc.placeId}:${arc.weight}`)
          .join(";");
        return `${transition.id}:${transition.lambdaType}:${inputs}|${outputs}`;
      })
      .join(",")}`,
  );

  // Differential equations structure (id, colorId)
  parts.push(
    `des:${sdcpn.differentialEquations
      .map((de) => `${de.id}:${de.colorId}`)
      .join(",")}`,
  );

  return parts.join("|");
}

export interface LSPProviderProps {
  children: React.ReactNode;
}

export const LSPProvider: React.FC<LSPProviderProps> = ({ children }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const [isReady, setIsReady] = useState(false);
  const clientRef = useRef<LSPClient | null>(null);

  // Track previous code content for incremental updates
  const prevCodeRef = useRef<Map<string, string>>(new Map());

  // Compute structural hash for re-initialization detection
  const structuralHash = useMemo(
    () => computeStructuralHash(petriNetDefinition),
    [petriNetDefinition],
  );

  // Create/recreate client when structural hash changes
  useEffect(() => {
    // Dispose previous client
    if (clientRef.current) {
      clientRef.current.dispose();
      clientRef.current = null;
      setIsReady(false);
    }

    // Create new client and initialize
    const client = new LSPClient();
    clientRef.current = client;

    // Initialize with current SDCPN
    void client.initialize(petriNetDefinition).then(() => {
      // Only set ready if this is still the current client
      if (clientRef.current === client) {
        setIsReady(true);

        // Build initial code map
        const codeMap = new Map<string, string>();
        for (const de of petriNetDefinition.differentialEquations) {
          const path = getItemFilePath("differential-equation-code", {
            id: de.id,
          });
          codeMap.set(path, de.code);
        }
        for (const transition of petriNetDefinition.transitions) {
          const lambdaPath = getItemFilePath("transition-lambda-code", {
            transitionId: transition.id,
          });
          const kernelPath = getItemFilePath("transition-kernel-code", {
            transitionId: transition.id,
          });
          codeMap.set(lambdaPath, transition.lambdaCode);
          codeMap.set(kernelPath, transition.transitionKernelCode);
        }
        prevCodeRef.current = codeMap;
      }
    });

    // Cleanup on unmount or when hash changes
    return () => {
      if (clientRef.current === client) {
        client.dispose();
        clientRef.current = null;
        setIsReady(false);
      }
    };
  }, [structuralHash]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: petriNetDefinition is intentionally not in deps - we use structuralHash

  // Push incremental code updates when only code changes
  useEffect(() => {
    const client = clientRef.current;
    if (!client || !isReady) {
      return;
    }

    // Check for code changes and push updates
    const newCodeMap = new Map<string, string>();

    for (const de of petriNetDefinition.differentialEquations) {
      const path = getItemFilePath("differential-equation-code", { id: de.id });
      newCodeMap.set(path, de.code);

      const prevCode = prevCodeRef.current.get(path);
      if (prevCode !== de.code) {
        client.updateDocument(path, de.code);
      }
    }

    for (const transition of petriNetDefinition.transitions) {
      const lambdaPath = getItemFilePath("transition-lambda-code", {
        transitionId: transition.id,
      });
      const kernelPath = getItemFilePath("transition-kernel-code", {
        transitionId: transition.id,
      });

      newCodeMap.set(lambdaPath, transition.lambdaCode);
      newCodeMap.set(kernelPath, transition.transitionKernelCode);

      const prevLambdaCode = prevCodeRef.current.get(lambdaPath);
      if (prevLambdaCode !== transition.lambdaCode) {
        client.updateDocument(lambdaPath, transition.lambdaCode);
      }

      const prevKernelCode = prevCodeRef.current.get(kernelPath);
      if (prevKernelCode !== transition.transitionKernelCode) {
        client.updateDocument(kernelPath, transition.transitionKernelCode);
      }
    }

    prevCodeRef.current = newCodeMap;
  }, [petriNetDefinition, isReady]);

  // Memoize context value
  const contextValue = useMemo<LSPContextValue>(
    () => ({
      client: clientRef.current,
      isReady,
    }),
    [isReady],
  );

  return (
    <LSPContext.Provider value={contextValue}>{children}</LSPContext.Provider>
  );
};
