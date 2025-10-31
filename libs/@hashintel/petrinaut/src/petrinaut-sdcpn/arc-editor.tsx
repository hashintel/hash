import { css } from "@hashintel/ds-helpers/css";
import { useEffect, useMemo, useState } from "react";
import { useReactFlow } from "reactflow";

import { TextField } from "./components/text-field";
import { useEditorContext } from "./editor-context";

interface ArcMenuProps {
  arcId: string;
  tokenWeights: {
    [tokenTypeId: string]: number | undefined;
  };
  position: { x: number; y: number };
  onClose: () => void;
  onUpdateWeights: (
    arcId: string,
    tokenWeights: { [tokenTypeId: string]: number | undefined },
  ) => void;
}

export const ArcEditor = ({
  arcId,
  tokenWeights,
  position,
  onClose: _onClose,
  onUpdateWeights,
}: ArcMenuProps) => {
  const [localWeights, setLocalWeights] = useState<{
    [tokenTypeId: string]: number | undefined;
  }>(tokenWeights);

  const { getNodes, getEdges } = useReactFlow();

  const { petriNetDefinition } = useEditorContext();

  const direction = useMemo(() => {
    const arc = getEdges().find((edge) => edge.id === arcId);

    const targetNode = getNodes().find((node) => node.id === arc?.target);

    if (!targetNode) {
      return "in";
    }

    return targetNode.type === "transition" ? "in" : "out";
  }, [arcId, getEdges, getNodes]);

  useEffect(() => {
    setLocalWeights(tokenWeights);
  }, [tokenWeights]);

  const handleWeightChange = (tokenTypeId: string, value: string) => {
    const parsedValue = Number.parseInt(value, 10);
    const newWeight = Math.max(0, parsedValue || 0);

    const newWeights = {
      ...localWeights,
      [tokenTypeId]: newWeight,
    };
    setLocalWeights(newWeights);
    onUpdateWeights(arcId, newWeights);
  };

  return (
    <div
      className={css({
        position: "fixed",
        left: `[${position.x}px]`,
        top: `[${position.y}px]`,
        zIndex: "[1000]",
        padding: "spacing.6",
        minWidth: "[200px]",
        backgroundColor: "[white]",
        borderRadius: "radius.8",
        border: "1px solid",
        borderColor: "core.gray.20",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
      })}
    >
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "spacing.3",
        })}
      >
        <div
          className={css({
            fontSize: "size.textxs",
            fontWeight: "semibold",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "core.gray.80",
          })}
        >
          {direction === "in" ? "Tokens Required" : "Tokens Produced"}
        </div>
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "spacing.3",
          })}
        >
          {petriNetDefinition.tokenTypes.map((tokenType) => (
            <div
              key={tokenType.id}
              className={css({
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "spacing.6",
              })}
            >
              <div
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "spacing.3",
                })}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    backgroundColor: tokenType.color,
                  }}
                />
                <span
                  className={css({
                    fontSize: "size.textxs",
                    color: "core.gray.70",
                  })}
                >
                  {tokenType.name}
                </span>
              </div>
              <TextField
                type="number"
                value={localWeights[tokenType.id] ?? 0}
                onChange={(event) =>
                  handleWeightChange(tokenType.id, event.target.value)
                }
                style={{ width: 80 }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
