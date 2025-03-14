import { TextField } from "@hashintel/design-system";
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { HexColorPicker } from "react-colorful";

import { Button } from "../../shared/ui";

// Token type definition
export interface TokenType {
  id: string;
  name: string;
  color: string;
}

// Color options for token types
export const colorOptions = [
  "#3498db", // Blue
  "#e74c3c", // Red
  "#2ecc71", // Green
  "#f39c12", // Orange
  "#9b59b6", // Purple
  "#1abc9c", // Teal
  "#34495e", // Dark Blue
  "#e67e22", // Dark Orange
  "#27ae60", // Dark Green
  "#c0392b", // Dark Red
] as const;

// Default token types
export const defaultTokenTypes: TokenType[] = [
  { id: "default", name: "Default", color: "#3498db" },
];

interface TokenEditorProps {
  open: boolean;
  onClose: () => void;
  tokenTypes: TokenType[];
  setTokenTypes: (tokenTypes: TokenType[]) => void;
}

export const TokenEditor = ({
  open,
  onClose,
  tokenTypes,
  setTokenTypes,
}: TokenEditorProps) => {
  // Local state for token types
  const [localTokenTypes, setLocalTokenTypes] = useState<TokenType[]>([]);

  // State for new token name
  const [newTokenName, setNewTokenName] = useState("");

  // State for selected token for editing
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);

  // State for color picker
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [currentColor, setCurrentColor] = useState("#3498db");

  // Initialize local state from props
  useEffect(() => {
    setLocalTokenTypes([...tokenTypes]);
  }, [tokenTypes]);

  // Handle adding a new token
  const handleAddToken = () => {
    if (newTokenName.trim()) {
      const newToken: TokenType = {
        id: `token-${Date.now()}`,
        name: newTokenName.trim(),
        color: currentColor,
      };

      setLocalTokenTypes([...localTokenTypes, newToken]);
      setNewTokenName("");
      setCurrentColor("#3498db");
    }
  };

  // Handle deleting a token
  const handleDeleteToken = (id: string) => {
    // Prevent deleting the last token
    if (localTokenTypes.length <= 1) {
      return;
    }

    setLocalTokenTypes(localTokenTypes.filter((token) => token.id !== id));

    // If the deleted token was selected, clear selection
    if (selectedTokenId === id) {
      setSelectedTokenId(null);
      setShowColorPicker(false);
    }
  };

  // Handle updating a token's color
  const handleColorChange = (color: string) => {
    setCurrentColor(color);

    if (selectedTokenId) {
      setLocalTokenTypes(
        localTokenTypes.map((token) =>
          token.id === selectedTokenId ? { ...token, color } : token,
        ),
      );
    }
  };

  // Handle selecting a token for editing
  const handleSelectToken = (id: string) => {
    setSelectedTokenId(id);
    const foundToken = localTokenTypes.find((token) => token.id === id);
    if (foundToken) {
      setCurrentColor(foundToken.color);
    }
  };

  // Handle token name change
  const handleTokenNameChange = (id: string, name: string) => {
    setLocalTokenTypes(
      localTokenTypes.map((token) =>
        token.id === id ? { ...token, name } : token,
      ),
    );
  };

  // Handle save and close
  const handleSave = () => {
    setTokenTypes(localTokenTypes);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography fontWeight="bold">Token Editor</Typography>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3}>
          {/* Add new token */}
          <Box>
            <Typography fontWeight="bold" sx={{ marginBottom: 1 }}>
              Add New Token Type
            </Typography>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <TextField
                value={newTokenName}
                onChange={(event) => setNewTokenName(event.target.value)}
                placeholder="Token name"
                size="small"
                sx={{ flex: 1 }}
              />
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 1,
                  backgroundColor: currentColor,
                  cursor: "pointer",
                  border: "1px solid #ccc",
                }}
                onClick={() => {
                  setSelectedTokenId(null);
                  setShowColorPicker(!showColorPicker);
                }}
              />
              <Button onClick={handleAddToken}>Add</Button>
            </Stack>
          </Box>

          {/* Color picker */}
          {showColorPicker && (
            <Box sx={{ width: "100%" }}>
              <HexColorPicker
                color={currentColor}
                onChange={handleColorChange}
              />
            </Box>
          )}

          {/* Token list */}
          <Box>
            <Typography fontWeight="bold" sx={{ marginBottom: 1 }}>
              Token Types
            </Typography>
            <Stack spacing={1}>
              {localTokenTypes.map((token) => (
                <Box
                  key={token.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    padding: 1,
                    borderRadius: 1,
                    border: "1px solid #eee",
                    backgroundColor:
                      selectedTokenId === token.id ? "#f5f5f5" : "transparent",
                  }}
                  onClick={() => handleSelectToken(token.id)}
                >
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      backgroundColor: token.color,
                      marginRight: 1,
                      border: "1px solid #ccc",
                    }}
                  />
                  <TextField
                    value={token.name}
                    onChange={(event) =>
                      handleTokenNameChange(token.id, event.target.value)
                    }
                    size="small"
                    sx={{ flex: 1 }}
                    onClick={(event) => event.stopPropagation()}
                  />
                  <Button
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteToken(token.id);
                    }}
                    disabled={
                      localTokenTypes.length <= 1 || token.id === "default"
                    }
                  >
                    Delete
                  </Button>
                </Box>
              ))}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};
