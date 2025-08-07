import { TextField } from "@hashintel/design-system";
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";

import { Button } from "../../../../shared/ui";
import { useEditorContext } from "../process-editor/editor-context";
import type { TokenType } from "../process-editor/types";

export const defaultTokenTypes: TokenType[] = [
  { id: "default", name: "Default", color: "#3498db" },
];

type TokenTypeEditorProps = {
  open: boolean;
  onClose: () => void;
};

export const TokenTypeEditor = ({ open, onClose }: TokenTypeEditorProps) => {
  const { petriNetDefinition, setPetriNetDefinition } = useEditorContext();

  const [localTokenTypes, setLocalTokenTypes] = useState<TokenType[]>(
    petriNetDefinition.tokenTypes,
  );

  useEffect(() => {
    setLocalTokenTypes(petriNetDefinition.tokenTypes);
  }, [petriNetDefinition.tokenTypes]);

  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenColor, setNewTokenColor] = useState("#3498db");

  const handleAddToken = () => {
    if (newTokenName.trim()) {
      const newToken: TokenType = {
        id: `token-${Date.now()}`,
        name: newTokenName.trim(),
        color: newTokenColor,
      };

      setLocalTokenTypes([...localTokenTypes, newToken]);
      setNewTokenName("");
      setNewTokenColor("#3498db");
    }
  };

  const handleDeleteToken = (id: string) => {
    if (localTokenTypes.length <= 1) {
      return;
    }

    setLocalTokenTypes(localTokenTypes.filter((token) => token.id !== id));
  };

  const handleTokenNameChange = (id: string, name: string) => {
    setLocalTokenTypes(
      localTokenTypes.map((token) =>
        token.id === id ? { ...token, name } : token,
      ),
    );
  };

  const handleSave = () => {
    setPetriNetDefinition((existingNet) => ({
      ...existingNet,
      tokenTypes: localTokenTypes,
    }));
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogContent>
        <Stack spacing={3}>
          <Box>
            <Typography
              component="div"
              variant="smallCaps"
              sx={{ fontWeight: 600, mb: 1 }}
            >
              Token Types
            </Typography>
            <Stack spacing={1}>
              {localTokenTypes.map((token) => (
                <Stack
                  key={token.id}
                  direction="row"
                  alignItems="center"
                  spacing={1}
                >
                  <Box
                    sx={{
                      position: "relative",
                      width: 24,
                      height: 24,
                      marginRight: 1,
                    }}
                  >
                    <Box
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        backgroundColor: token.color,
                        cursor: "pointer",
                      }}
                    />
                    <Box
                      component="input"
                      type="color"
                      value={token.color}
                      onChange={(event) => {
                        setLocalTokenTypes(
                          localTokenTypes.map((tok) =>
                            tok.id === token.id
                              ? { ...tok, color: event.currentTarget.value }
                              : tok,
                          ),
                        );
                      }}
                      sx={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        opacity: 0,
                        cursor: "pointer",
                      }}
                    />
                  </Box>
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
                    size="xs"
                    variant="tertiary"
                  >
                    Delete
                  </Button>
                </Stack>
              ))}
            </Stack>
          </Box>
          <Box>
            <Typography
              component="div"
              variant="smallCaps"
              sx={{ fontWeight: 600, mb: 1 }}
            >
              Add New
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                value={newTokenName}
                onChange={(event) => setNewTokenName(event.target.value)}
                placeholder="Token name"
                size="small"
              />
              <Box sx={{ position: "relative", width: 36, height: 36 }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 1,
                    backgroundColor: newTokenColor,
                    cursor: "pointer",
                  }}
                />
                <Box
                  component="input"
                  type="color"
                  value={newTokenColor}
                  onChange={(event) =>
                    setNewTokenColor(event.currentTarget.value)
                  }
                  sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    opacity: 0,
                    cursor: "pointer",
                  }}
                />
              </Box>
              <Button onClick={handleAddToken} size="xs">
                Add
              </Button>
            </Stack>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} size="small" variant="tertiary">
          Cancel
        </Button>
        <Button onClick={handleSave} size="small">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};
