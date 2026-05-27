import { faChevronDown, faCheck } from "@fortawesome/free-solid-svg-icons";
import { ButtonBase, Menu, Stack, Typography } from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";

import { FontAwesomeIcon } from "@hashintel/design-system";
import { Badge } from "@hashintel/ds-components";

import { MenuItem } from "../../../shared/ui/menu-item";

import type { EntityRevision } from "./use-process-save-and-load/use-entity-revisions";

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const formatRevisionLabel = (isoTimestamp: string): string => {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }

  return dateTimeFormatter.format(date);
};

export type VersionPickerProps = {
  /**
   * All saved revisions of the active entity, oldest first. The version
   * label is derived from the index of `loadedRevisionTime` within this
   * list (so "v1" is the oldest revision, "vN" is the latest).
   */
  revisions: EntityRevision[];
  /**
   * Decision-time of the revision currently loaded in the editor, or
   * `null` if the active net is unsaved.
   */
  loadedRevisionTime: string | null;
  /**
   * Whether the editor state diverges from the loaded revision. Used to
   * surface the "Draft" badge — the linear-edit model means a save while
   * dirty creates a new top revision (vN+1).
   */
  isDirty: boolean;
  onLoadRevision: (revision: EntityRevision) => void;
};

/**
 * Top-bar control for browsing the server-side revision history of a persisted Petri net.
 *
 * In-memory undo/redo is handled separately by Petrinaut's
 * `VersionHistoryButton` — these two histories intentionally don't share
 * a surface (keystroke-level deltas vs persisted snapshots).
 *
 * Loading a past revision replaces the editor's document.
 */
export const VersionPicker = ({
  revisions,
  loadedRevisionTime,
  isDirty,
  onLoadRevision,
}: VersionPickerProps) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "petrinaut-version-picker",
  });

  const loadedIndex = loadedRevisionTime
    ? revisions.findIndex(
        (revision) => revision.decisionTime === loadedRevisionTime,
      )
    : -1;

  // When dirty and we know the originating revision, fall back to its
  // index — the editor still "is" that version, plus pending edits.
  const versionNumber = loadedIndex >= 0 ? loadedIndex + 1 : null;

  if (versionNumber === null && !isDirty && revisions.length === 0) {
    return null;
  }

  return (
    <>
      <ButtonBase
        {...bindTrigger(popupState)}
        disabled={revisions.length === 0}
        sx={({ palette, transitions }) => ({
          alignItems: "center",
          borderRadius: 1,
          color: palette.gray[90],
          cursor: revisions.length === 0 ? "default" : "pointer",
          gap: 0.75,
          paddingX: 0.75,
          paddingY: 0.5,
          transition: transitions.create("background-color"),
          "&:hover": {
            backgroundColor:
              revisions.length === 0 ? "transparent" : palette.gray[15],
          },
          "&.Mui-disabled": {
            color: palette.gray[60],
          },
        })}
      >
        {versionNumber !== null && (
          <Typography
            component="span"
            sx={{
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 1,
            }}
          >
            v{versionNumber}
          </Typography>
        )}
        {isDirty && (
          <Badge colorScheme="gray" size="xs">
            Draft
          </Badge>
        )}
        {revisions.length > 0 && (
          <FontAwesomeIcon
            icon={faChevronDown}
            sx={{ fontSize: 10, color: "inherit" }}
          />
        )}
      </ButtonBase>

      <Menu
        {...bindMenu(popupState)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            elevation: 4,
            sx: ({ palette }) => ({
              borderRadius: "8px",
              marginTop: 0.5,
              minWidth: 220,
              maxHeight: 320,
              border: `1px solid ${palette.gray[20]}`,
            }),
          },
        }}
      >
        {[...revisions]
          // Most recent first in the dropdown.
          .reverse()
          .map((revision, reversedIndex) => {
            const realIndex = revisions.length - 1 - reversedIndex;
            const isLoaded = realIndex === loadedIndex;
            return (
              <MenuItem
                key={revision.decisionTime}
                onClick={() => {
                  popupState.close();
                  onLoadRevision(revision);
                }}
                selected={isLoaded}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                  paddingY: 1,
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography
                    component="span"
                    sx={({ palette }) => ({
                      fontSize: 13,
                      fontWeight: 500,
                      color: palette.gray[90],
                    })}
                  >
                    v{realIndex + 1}
                  </Typography>
                  <Typography
                    component="span"
                    sx={({ palette }) => ({
                      fontSize: 13,
                      color: palette.gray[70],
                    })}
                  >
                    {formatRevisionLabel(revision.decisionTime)}
                  </Typography>
                </Stack>
                {isLoaded && (
                  <FontAwesomeIcon
                    icon={faCheck}
                    sx={({ palette }) => ({
                      fontSize: 12,
                      color: palette.gray[70],
                    })}
                  />
                )}
              </MenuItem>
            );
          })}
      </Menu>
    </>
  );
};
