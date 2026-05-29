import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  ButtonBase,
  Menu,
  Stack,
  Typography,
  menuItemClasses,
} from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";

import { FontAwesomeIcon } from "@hashintel/design-system";

import { MenuItem } from "../../../../shared/ui/menu-item";

import type { RevisionSummary } from "../../shared/messages";

/**
 * Locale is left `undefined` so `Intl.DateTimeFormat` picks up the browser's
 * preference. The embed page renders client-side only (Petrinaut requires
 * browser APIs), so there's no SSR/hydration mismatch risk.
 */
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

const formatRevisionParts = (
  isoTimestamp: string,
): { date: string; time: string } => {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return { date: isoTimestamp, time: "" };
  }

  return {
    date: dateFormatter.format(date),
    time: timeFormatter.format(date),
  };
};

const VERSION_COLUMN_WIDTH = 22;
const DATE_COLUMN_WIDTH = 80;
const TIME_COLUMN_WIDTH = 30;

const DraftBadge = () => (
  <Box
    component="span"
    sx={({ palette }) => ({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      paddingX: 0.7,
      paddingY: 0.5,
      lineHeight: 1,
      backgroundColor: "#F0F0F0",
      color: palette.gray[90],
      borderRadius: 1,
      fontSize: 12,
      fontWeight: 500,
    })}
  >
    Draft
  </Box>
);

type VersionPickerProps = {
  /**
   * Revision summaries from the host (newest first). The version label is
   * derived as `revisions.length - index` (so index 0 is "vN", the latest).
   */
  revisions: RevisionSummary[];
  /**
   * Decision-time of the revision the editor is currently mirrored against,
   * or `null` if the active net is unsaved or has no saved revisions yet.
   */
  loadedRevisionTime: string | null;
  /**
   * Whether the editor state diverges from the loaded revision. Drives the
   * "Draft" badge — a save while dirty creates a new top revision (vN+1).
   */
  isDirty: boolean;
  onLoadRevision: (revision: RevisionSummary) => void;
};

/**
 * Top-bar control for browsing the server-side revision history of a
 * persisted Petri net.
 *
 * The picker itself lives inside the Petrinaut iframe (the host pushes the
 * `revisions` summary list over the bridge); selecting a revision sends a
 * `requestRevision` message back to the host, which fetches the full SDCPN
 * and replies with `load`.
 *
 * In-memory undo/redo is handled separately by Petrinaut's
 * `VersionHistoryButton` — these two histories intentionally don't share a
 * surface (keystroke-level deltas vs persisted snapshots).
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

  const versionNumber =
    loadedIndex >= 0 ? revisions.length - loadedIndex : null;

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
          gap: 1,
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
        {isDirty && <DraftBadge />}
        {revisions.length > 0 && (
          <FontAwesomeIcon
            icon={faChevronDown}
            sx={({ palette }) => ({
              fontSize: 10,
              color: palette.gray[80],
            })}
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
              minWidth: 240,
              maxHeight: 320,
              border: `1px solid ${palette.gray[20]}`,
            }),
          },
        }}
      >
        {revisions.map((revision, index) => {
          const isLoaded = index === loadedIndex;
          const versionN = revisions.length - index;
          const { date, time } = formatRevisionParts(revision.decisionTime);

          return (
            <MenuItem
              key={revision.decisionTime}
              onClick={() => {
                popupState.close();
                onLoadRevision(revision);
              }}
              selected={isLoaded}
              sx={({ palette }) => ({
                display: "flex",
                justifyContent: "space-between",
                gap: 2,
                paddingY: 1,
                color: palette.gray[90],
                [`&.${menuItemClasses.selected}`]: {
                  backgroundColor: palette.gray[20],
                  color: palette.gray[90],
                },
                [`&.${menuItemClasses.focusVisible}, &:hover`]: {
                  backgroundColor: palette.gray[15],
                },
                [`&.${menuItemClasses.selected}.${menuItemClasses.focusVisible}, &.${menuItemClasses.selected}:hover`]:
                  {
                    backgroundColor: palette.gray[30],
                  },
              })}
            >
              <Stack direction="row" spacing={1.5} alignItems="baseline">
                <Typography
                  component="span"
                  sx={({ palette }) => ({
                    fontSize: 13,
                    fontWeight: 500,
                    color: palette.gray[90],
                    minWidth: VERSION_COLUMN_WIDTH,
                    fontVariantNumeric: "tabular-nums",
                  })}
                >
                  v{versionN}
                </Typography>
                <Typography
                  component="span"
                  sx={({ palette }) => ({
                    fontSize: 13,
                    color: palette.gray[70],
                    minWidth: DATE_COLUMN_WIDTH,
                    fontVariantNumeric: "tabular-nums",
                  })}
                >
                  {date}
                </Typography>
                <Typography
                  component="span"
                  sx={({ palette }) => ({
                    fontSize: 13,
                    color: palette.gray[70],
                    minWidth: TIME_COLUMN_WIDTH,
                    fontVariantNumeric: "tabular-nums",
                  })}
                >
                  {time}
                </Typography>
              </Stack>
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
};
