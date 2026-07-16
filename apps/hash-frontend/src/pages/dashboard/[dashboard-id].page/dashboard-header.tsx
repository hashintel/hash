import { Box, Typography } from "@mui/material";
import { useEffect, useState } from "react";

import { Button, TextArea, TextInput } from "@hashintel/ds-components";

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

  useEffect(() => {
    if (!isEditing) {
      setEditedTitle(title);
      setEditedDescription(description ?? "");
    }
  }, [description, isEditing, title]);

  const handleSave = () => {
    if (editedTitle !== title || editedDescription !== (description ?? "")) {
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
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
              maxWidth: 600,
            }}
          >
            <TextInput
              value={editedTitle}
              onChange={(value) => setEditedTitle(value)}
              placeholder="Dashboard title"
              size="md"
            />
            <TextArea
              value={editedDescription}
              onChange={(value) => setEditedDescription(value)}
              placeholder="Description (optional)"
              rows={2}
              size="sm"
            />
          </Box>
        ) : (
          <>
            <Typography
              component="h1"
              sx={{
                fontSize: 24,
                fontWeight: 500,
                lineHeight: "30px",
                color: "#202020",
              }}
            >
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

      <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
        {canEdit && (
          <Button
            variant="subtle"
            tone="neutral"
            size="sm"
            iconName={isEditing ? "check" : "pencil"}
            pressed={isEditing}
            aria-label={isEditing ? "Finish editing" : "Edit dashboard"}
            onClick={isEditing ? handleSave : onEditToggle}
          />
        )}
        <Button
          variant="subtle"
          tone="neutral"
          size="sm"
          iconName={isFullscreen ? "collapse" : "expand"}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          onClick={onFullscreenToggle}
        />
        {canEdit && (
          <Button
            variant="solid"
            tone="neutral"
            size="sm"
            iconName="plus"
            onClick={onAddItem}
          >
            Add item
          </Button>
        )}
      </Box>
    </Box>
  );
};
