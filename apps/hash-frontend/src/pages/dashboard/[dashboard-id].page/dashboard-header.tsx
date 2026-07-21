import { Box, Typography } from "@mui/material";
import { useEffect, useState } from "react";

import { AlertModal } from "@hashintel/design-system";
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
  onArchive: () => Promise<void>;
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
  onArchive,
}: DashboardHeaderProps) => {
  const [editedTitle, setEditedTitle] = useState(title);
  const [editedDescription, setEditedDescription] = useState(description ?? "");
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveInProgress, setArchiveInProgress] = useState(false);

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

  const handleArchive = async () => {
    setArchiveInProgress(true);
    setArchiveError(null);

    try {
      await onArchive();
    } catch (error) {
      setArchiveError(
        error instanceof Error ? error.message : "Could not archive dashboard",
      );
      setArchiveInProgress(false);
    }
  };

  return (
    <>
      {archiveModalOpen && (
        <AlertModal
          callback={handleArchive}
          calloutMessage={
            archiveError ??
            "The dashboard, every item in it, and their links will be archived."
          }
          close={() => {
            if (!archiveInProgress) {
              setArchiveModalOpen(false);
              setArchiveError(null);
            }
          }}
          confirmButtonText="Archive dashboard"
          header={`Archive “${title}”?`}
          open
          processing={archiveInProgress}
          type="warning"
        />
      )}
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
          {canEdit && isEditing && (
            <Button
              variant="subtle"
              tone="neutral"
              size="sm"
              iconName="trash"
              aria-label="Archive dashboard"
              onClick={() => setArchiveModalOpen(true)}
            />
          )}
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
    </>
  );
};
