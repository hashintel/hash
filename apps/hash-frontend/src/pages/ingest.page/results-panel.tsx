/**
 * Results panel: collapsible entity cards with assertion windows.
 *
 * Left-side panel in the ingest results view. Each entity card expands to
 * show assertion windows where that entity appears as a participant.
 */
import {
  Box,
  ButtonBase,
  Collapse,
  ListSubheader,
  Typography,
} from "@mui/material";
import type { FunctionComponent } from "react";
import { useMemo, useState } from "react";

import type { Selection } from "./evidence-resolver";
import { buildEntityAssertionMap } from "./evidence-resolver";
import type { AssertionWindow, MentionContextPlan, RosterEntry } from "./types";

interface ResultsPanelProps {
  rosterEntries: RosterEntry[];
  mentionContexts: MentionContextPlan[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  person: "👤",
  organization: "🏢",
  place: "📍",
  artifact: "📄",
  event: "📅",
  other: "◽",
};

const AssertionWindowItem: FunctionComponent<{
  window: AssertionWindow;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ window: win, isSelected, onSelect }) => (
  <ButtonBase
    onClick={onSelect}
    sx={{
      display: "block",
      width: "100%",
      px: 2,
      py: 1,
      pl: 4,
      textAlign: "left",
      borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
      bgcolor: isSelected ? "rgba(59, 130, 246, 0.08)" : "transparent",
      "&:hover": { bgcolor: "rgba(59, 130, 246, 0.04)" },
    }}
  >
    <Typography
      variant="microText"
      sx={{
        color: "gray.80",
        lineHeight: 1.5,
        display: "-webkit-box",
        WebkitLineClamp: 3,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}
    >
      {win.text}
    </Typography>
    <Typography
      variant="microText"
      sx={{ color: "gray.50", mt: 0.5, fontStyle: "italic" }}
    >
      &quot;{win.mentionSurface}&quot;
    </Typography>
  </ButtonBase>
);

const EntityCard: FunctionComponent<{
  entry: RosterEntry;
  assertionWindows: AssertionWindow[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
}> = ({ entry, assertionWindows, selection, onSelect }) => {
  const [expanded, setExpanded] = useState(false);
  const isEntitySelected =
    selection?.kind === "entity" &&
    selection.entry.rosterEntryId === entry.rosterEntryId;

  const selectedAssertionBlockId =
    selection?.kind === "assertion" ? selection.window.blockId : null;

  return (
    <Box>
      <ButtonBase
        onClick={() => {
          setExpanded((prev) => !prev);
          onSelect(isEntitySelected ? null : { kind: "entity", entry });
        }}
        sx={{
          display: "flex",
          width: "100%",
          px: 2,
          py: 1.5,
          textAlign: "left",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
          bgcolor: isEntitySelected
            ? "rgba(59, 130, 246, 0.08)"
            : "transparent",
          "&:hover": { bgcolor: "rgba(59, 130, 246, 0.04)" },
        }}
      >
        <Box
          sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}
        >
          <Typography component="span" sx={{ flexShrink: 0 }}>
            {CATEGORY_ICONS[entry.category ?? "other"] ?? "◽"}
          </Typography>
          <Typography
            variant="smallTextLabels"
            sx={{
              fontWeight: isEntitySelected || expanded ? 600 : 400,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {entry.canonicalName}
          </Typography>
        </Box>
        <Box
          sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}
        >
          {assertionWindows.length > 0 && (
            <Typography variant="microText" sx={{ color: "gray.50" }}>
              {assertionWindows.length}
            </Typography>
          )}
          <Typography
            component="span"
            sx={{
              fontSize: "0.75rem",
              color: "gray.50",
              transform: expanded ? "rotate(90deg)" : "none",
              transition: "transform 0.15s",
            }}
          >
            ▶
          </Typography>
        </Box>
      </ButtonBase>

      <Collapse in={expanded}>
        {assertionWindows.length > 0 ? (
          assertionWindows.map((win, idx) => (
            <AssertionWindowItem
              key={`${win.blockId}-${idx}`}
              window={win}
              isSelected={selectedAssertionBlockId === win.blockId}
              onSelect={() =>
                onSelect(
                  selectedAssertionBlockId === win.blockId
                    ? null
                    : { kind: "assertion", window: win },
                )
              }
            />
          ))
        ) : (
          <Box sx={{ px: 4, py: 1.5 }}>
            <Typography
              variant="microText"
              sx={{ color: "gray.50", fontStyle: "italic" }}
            >
              {entry.summary}
            </Typography>
          </Box>
        )}
      </Collapse>
    </Box>
  );
};

export const ResultsPanel: FunctionComponent<ResultsPanelProps> = ({
  rosterEntries,
  mentionContexts,
  selection,
  onSelect,
}) => {
  const entityAssertionMap = useMemo(
    () => buildEntityAssertionMap(mentionContexts),
    [mentionContexts],
  );

  return (
    <Box
      sx={{
        width: 360,
        minWidth: 360,
        borderRight: ({ palette }) => `1px solid ${palette.gray[30]}`,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <ListSubheader
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: ({ palette }) => `1px solid ${palette.gray[30]}`,
          fontSize: "0.75rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          lineHeight: 1,
        }}
      >
        Entities ({rosterEntries.length})
      </ListSubheader>

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {rosterEntries.map((entry) => (
          <EntityCard
            key={entry.rosterEntryId}
            entry={entry}
            assertionWindows={entityAssertionMap.get(entry.rosterEntryId) ?? []}
            selection={selection}
            onSelect={onSelect}
          />
        ))}
      </Box>
    </Box>
  );
};
