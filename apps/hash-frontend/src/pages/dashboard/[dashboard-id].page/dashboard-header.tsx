import { IconButton, TextField } from "@hashintel/design-system";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  Save as SaveIcon,
} from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import { useState } from "react";

import { Button } from "../../../shared/ui/button";

type DashboardHeaderProps = {
  title: string;
  description?: string;
  isEditing: boolean;
  canEdit: boolean;
  isFullscreen: boolean;
  onEditToggle: () => void;
  onFullscreenToggle: () => void;
  onTitleOrDescriptionChange: (title: string, description: string) => void;
  onAddItem?: () => void;
};

export const DashboardHeader = ({
  title,
  description,
  isEditing,
  canEdit,
  isFullscreen,
  onEditToggle,
  onFullscreenToggle,
  onTitleOrDescriptionChange,
  onAddItem,
}: DashboardHeaderProps) => {
  const [editedTitle, setEditedTitle] = useState(title);
  const [editedDescription, setEditedDescription] = useState(description ?? "");

  const handleSave = () => {
    if (editedTitle !== title || editedDescription !== description) {
      onTitleOrDescriptionChange(editedTitle, editedDescription);
    }
    onEditToggle();
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        mb: 3,
        gap: 2,
      }}
    >
      <Box sx={{ flex: 1 }}>
        {isEditing ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <TextField
              value={editedTitle}
              onChange={(event) => setEditedTitle(event.target.value)}
              size="small"
              placeholder="Dashboard title"
              sx={{ maxWidth: 400 }}
            />
            <TextField
              value={editedDescription}
              onChange={(event) => setEditedDescription(event.target.value)}
              size="small"
              placeholder="Description (optional)"
              multiline
              rows={2}
              sx={{ maxWidth: 600 }}
            />
          </Box>
        ) : (
          <>
            <Typography variant="h4" component="h1">
              {title}
            </Typography>
            {description && (
              <Typography
                variant="regularTextParagraphs"
                sx={{ mt: 0.5, color: ({ palette }) => palette.gray[70] }}
              >
                {description}
              </Typography>
            )}
          </>
        )}
      </Box>

      <Box sx={{ display: "flex", gap: 1 }}>
        {canEdit && isEditing && (
          <Button
            variant="secondary"
            startIcon={<AddIcon />}
            onClick={onAddItem}
            size="xs"
          >
            Add Item
          </Button>
        )}
        {canEdit && (
          <IconButton onClick={isEditing ? handleSave : onEditToggle}>
            {isEditing ? <SaveIcon /> : <EditIcon />}
          </IconButton>
        )}
        <IconButton onClick={onFullscreenToggle}>
          {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
        </IconButton>
      </Box>
    </Box>
  );
};
