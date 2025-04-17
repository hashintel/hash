import { useCallback, useEffect, useState } from "react";
import { getBezierPath, type Position, useReactFlow } from "reactflow";

import { defaultTokenTypes, type TokenType } from "./token-type-editor";

type AnimatingToken = {
  id: string;
  tokenTypeId: string;
  progress: number;
  startTime: number;
  steps: number[];
  currentStep: number;
};

export const Arc = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  data?: {
    tokenWeights: {
      [tokenTypeId: string]: number;
    };
  };
}) => {
  const { tokenTypes } = useReactFlow()
    .getNodes()
    .reduce<{ tokenTypes: TokenType[] }>(
      (acc, node) => {
        if (node.type === "place" && node.data.tokenTypes) {
          return { tokenTypes: node.data.tokenTypes };
        }
        return acc;
      },
      { tokenTypes: defaultTokenTypes },
    );

  const [animatingTokens, setAnimatingTokens] = useState<AnimatingToken[]>([]);
  const [arcPath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Animation effect
  useEffect(() => {
    let animationFrameId: number;
    const animate = () => {
      const now = performance.now();

      setAnimatingTokens((currentTokens) => {
        // Update each token's progress through steps
        return currentTokens
          .map((token) => {
            const elapsed = now - token.startTime;
            const stepDuration = 500; // 500ms per step
            const currentStepTime = elapsed % stepDuration;
            const shouldAdvanceStep = currentStepTime < 16; // Check if we should move to next step (16ms is roughly one frame)

            if (
              shouldAdvanceStep &&
              token.currentStep < token.steps.length - 1
            ) {
              return {
                ...token,
                currentStep: token.currentStep + 1,
                progress: token.steps[token.currentStep + 1],
              };
            }

            // Remove token if it has completed all steps
            if (token.currentStep >= token.steps.length - 1) {
              return null;
            }

            return token;
          })
          .filter(Boolean) as AnimatingToken[];
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const addAnimatingToken = useCallback((tokenTypeId: string) => {
    const steps = Array.from({ length: 20 }, (_, i) => i / 19);

    const newToken: AnimatingToken = {
      id: Math.random().toString(),
      tokenTypeId,
      progress: 0,
      startTime: performance.now(),
      steps,
      currentStep: 0,
    };
    setAnimatingTokens((current) => [...current, newToken]);
  }, []);

  // Listen for transition firings
  useEffect(() => {
    const handleTransitionFired = (
      event: CustomEvent<{
        arcId: string;
        tokenTypeId: string;
        isInput?: boolean;
      }>,
    ) => {
      const { arcId, tokenTypeId } = event.detail;
      if (arcId === id) {
        addAnimatingToken(tokenTypeId);
      }
    };

    window.addEventListener(
      "transitionFired",
      handleTransitionFired as EventListener,
    );
    return () => {
      window.removeEventListener(
        "transitionFired",
        handleTransitionFired as EventListener,
      );
    };
  }, [id, addAnimatingToken]);

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={arcPath}
        fill="none"
        strokeWidth={20}
        stroke="#555"
        style={{
          cursor: "pointer",
          strokeOpacity: 0.1,
        }}
      />
      <path
        id={`${id}-visible`}
        className="react-flow__edge-path"
        d={arcPath}
        fill="none"
        strokeWidth={2}
        stroke="#555"
        style={{ pointerEvents: "none" }}
      />
      {animatingTokens.map((token) => {
        const tokenType = tokenTypes.find(
          (tt: TokenType) => tt.id === token.tokenTypeId,
        );
        return (
          <g key={token.id}>
            <circle
              r="6"
              fill={tokenType?.color ?? "#3498db"}
              className="animating-token"
              style={{
                offsetPath: `path("${arcPath}")`,
                offsetDistance: "0%",
              }}
            />
          </g>
        );
      })}
      <style>
        {`
            .animating-token {
              animation: moveToken 500ms linear forwards;
            }
            @keyframes moveToken {
              0% {
                offset-distance: 0%;
                opacity: 1;
              }
              90% {
                opacity: 1;
              }
              100% {
                offset-distance: 100%;
                opacity: 0;
              }
            }
          `}
      </style>
      <g transform={`translate(${labelX}, ${labelY})`}>
        {/* Show tokens required or produced */}
        {Object.entries(data?.tokenWeights ?? {})
          .filter(([_, weight]) => weight > 0)
          .map(([tokenTypeId, weight], index, nonZeroWeights) => {
            const tokenType = tokenTypes.find(
              (tt: TokenType) => tt.id === tokenTypeId,
            );

            if (!tokenType) {
              throw new Error(
                `Token type with ID '${tokenTypeId}' not found for arc '${id}'`,
              );
            }

            const yOffset = (index - (nonZeroWeights.length - 1) / 2) * 20;

            return (
              <g key={tokenTypeId} transform={`translate(0, ${yOffset})`}>
                <circle cx="0" cy="0" r="8" fill={tokenType.color} />
                <text
                  x="0"
                  y="0"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{
                    fontSize: "10px",
                    fontWeight: "bold",
                    fill: "white",
                    pointerEvents: "none",
                  }}
                >
                  {weight}
                </text>
              </g>
            );
          })}
      </g>
    </>
  );
};
