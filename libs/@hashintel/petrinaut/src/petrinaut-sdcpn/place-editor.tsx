import { css } from "@hashintel/ds-helpers/css";

import { Button } from "./components/button";
import { TextField } from "./components/text-field";
import type { PlaceNodeType, TokenCounts, TokenType } from "./types";

export type PlaceEditorProps = {
  selectedPlace: PlaceNodeType;
  tokenTypes: TokenType[];
  onClose: () => void;
  onUpdateInitialTokens: (nodeId: string, tokenCounts: TokenCounts) => void;
  onUpdateNodeLabel: (nodeId: string, label: string) => void;
  position: { x: number; y: number };
};

export const PlaceEditor = ({
  position,
  selectedPlace,
  tokenTypes,
  onClose,
  onUpdateInitialTokens,
  onUpdateNodeLabel,
}: PlaceEditorProps) => {
  const { data, id: placeId } = selectedPlace;
  const { label: nodeName, initialTokenCounts } = data;

  const handleTokenCountChange = (tokenTypeId: string, value: string) => {
    const numValue = Number.parseInt(value, 10);
    const newCount = Number.isNaN(numValue) ? 0 : Math.max(0, numValue);

    const newTokenCounts = {
      ...initialTokenCounts,
      [tokenTypeId]: newCount,
    };

    onUpdateInitialTokens(placeId, newTokenCounts);
  };

  const handleNodeNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newName = event.target.value;
    onUpdateNodeLabel(placeId, newName);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      (event.target as HTMLInputElement).blur();
    }
  };

  return (
    <div
      className={css({
        position: "fixed",
        left: `[${position.x}px]`,
        top: `[${position.y}px]`,
        zIndex: "[1000]",
        paddingX: "spacing.6",
        paddingTop: "spacing.3",
        paddingBottom: "spacing.5",
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
          gap: "spacing.6",
        })}
      >
        <div>
          <label htmlFor="node-name-input">
            <div
              className={css({
                fontSize: "size.textxs",
                fontWeight: "semibold",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "core.gray.80",
                marginBottom: "spacing.2",
              })}
            >
              Name
            </div>
          </label>
          <TextField
            id="node-name-input"
            value={nodeName}
            onChange={handleNodeNameChange}
            onKeyDown={handleKeyDown}
            fullWidth
            placeholder="Enter node name"
          />
        </div>

        {tokenTypes.length > 0 && (
          <div>
            <div
              className={css({
                fontSize: "size.textxs",
                fontWeight: "semibold",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "core.gray.80",
                marginBottom: "spacing.2",
              })}
            >
              Initial Token Counts
            </div>
            <div
              className={css({
                display: "flex",
                flexDirection: "column",
                gap: "spacing.3",
              })}
            >
              {tokenTypes.map((tokenType) => (
                <div
                  key={tokenType.id}
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
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
                        width: 14,
                        height: 14,
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
                    value={initialTokenCounts?.[tokenType.id] ?? 0}
                    onChange={(event) =>
                      handleTokenCountChange(tokenType.id, event.target.value)
                    }
                    style={{ width: 80 }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          className={css({
            display: "flex",
            justifyContent: "flex-end",
          })}
        >
          <Button onClick={onClose} size="small">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
