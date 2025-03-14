import { TextField } from "@hashintel/design-system";
import { Box, Card, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";

import { Button } from "../../shared/ui";
import type { TokenType } from "./token-editor";

// Interface for token counts by type
export interface TokenCounts {
  [tokenTypeId: string]: number;
}

export interface NodeMenuProps {
  nodeId: string;
  nodeName: string;
  position: { x: number; y: number };
  tokenTypes: TokenType[];
  tokenCounts: TokenCounts;
  onClose: () => void;
  onUpdateTokens: (nodeId: string, tokenCounts: TokenCounts) => void;
  onUpdateNodeLabel: (nodeId: string, label: string) => void;
}

export const NodeMenu = ({
  nodeId,
  nodeName,
  position,
  tokenTypes,
  tokenCounts,
  onClose,
  onUpdateTokens,
  onUpdateNodeLabel,
}: NodeMenuProps) => {
  // Local state for token counts
  const [localTokenCounts, setLocalTokenCounts] = useState<TokenCounts>({});

  // Local state for node name
  const [localNodeName, setLocalNodeName] = useState(nodeName);

  // Initialize local state from props
  useEffect(() => {
    setLocalTokenCounts({ ...tokenCounts });
  }, [tokenCounts]);

  useEffect(() => {
    setLocalNodeName(nodeName);
  }, [nodeName]);

  // Handle token count change
  const handleTokenCountChange = (tokenTypeId: string, value: string) => {
    const numValue = parseInt(value, 10);
    const newCount = Number.isNaN(numValue) ? 0 : Math.max(0, numValue);

    const newTokenCounts = {
      ...localTokenCounts,
      [tokenTypeId]: newCount,
    };
    setLocalTokenCounts(newTokenCounts);
    onUpdateTokens(nodeId, newTokenCounts); // Update immediately
  };

  // Handle node name change
  const handleNodeNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newName = event.target.value;
    setLocalNodeName(newName);
    onUpdateNodeLabel(nodeId, newName); // Update immediately
  };

  // Remove the separate update handlers since we're updating immediately
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      (event.target as HTMLInputElement).blur();
    }
  };

  // Calculate total tokens
  const totalTokens = Object.values(localTokenCounts).reduce(
    (sum, count) => sum + count,
    0,
  );

  return (
    <Card
      sx={{
        position: "absolute",
        left: position.x,
        top: position.y,
        zIndex: 1000,
        width: 300,
        padding: 2,
        boxShadow: 3,
      }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography fontWeight="bold">Node Name</Typography>
          <TextField
            value={localNodeName}
            onChange={handleNodeNameChange}
            onKeyDown={handleKeyDown}
            fullWidth
            size="small"
            placeholder="Enter node name"
          />
        </Box>

        {tokenTypes.length > 0 && (
          <Box>
            <Typography fontWeight="bold">Tokens</Typography>
            <Stack spacing={1}>
              {tokenTypes.map((tokenType) => (
                <Box
                  key={tokenType.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box
                      sx={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        backgroundColor: tokenType.color,
                      }}
                    />
                    <Typography>{tokenType.name}</Typography>
                  </Box>
                  <TextField
                    type="number"
                    value={localTokenCounts[tokenType.id] ?? 0}
                    onChange={(event) =>
                      handleTokenCountChange(tokenType.id, event.target.value)
                    }
                    size="small"
                    inputProps={{
                      min: 0,
                      style: { textAlign: "center", width: "60px" },
                    }}
                  />
                </Box>
              ))}
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography fontWeight="bold">Total:</Typography>
                <Typography fontWeight="bold">{totalTokens}</Typography>
              </Box>
            </Stack>
          </Box>
        )}

        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={onClose}>Close</Button>
        </Box>
      </Stack>
    </Card>
  );
};
