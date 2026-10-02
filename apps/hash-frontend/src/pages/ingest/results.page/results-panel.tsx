/**
 * Results panel: collapsible entity cards with claims or assertion windows.
 *
 * Left-side panel in the ingest results view. Each entity card expands to
 * show either assertion windows (from mentionContexts) or claims (fallback).
 * Only claim/assertion clicks trigger bbox highlights — entity card clicks
 * only toggle expand/collapse.
 */
import {
  Box,
  ButtonBase,
  Collapse,
  ListSubheader,
  Stack,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";

import {
  buildEntityAssertionMap,
  getAssertionWindowKey,
} from "./evidence-resolver";
import { groupClaimsByEntity } from "./results-panel/claim-grouping";
import { highlightColors } from "./shared/highlight-styles";

import type {
  AssertionWindow,
  ExtractedClaim,
  MentionCategory,
  MentionContextPlan,
  RosterEntry,
} from "../shared/types";
import type { Selection } from "./evidence-resolver";
import type { FunctionComponent } from "react";

interface ResultsPanelProps {
  rosterEntries: RosterEntry[];
  claims: ExtractedClaim[];
  mentionContexts: MentionContextPlan[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

const categoryIcons: Record<MentionCategory, string> = {
  person: "👤",
  organization: "🏢",
  place: "📍",
  artifact: "📄",
  event: "📅",
  other: "◽",
};

const EvidenceItem: FunctionComponent<{
  text: string;
  quote: string | undefined;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ text, quote, isSelected, onSelect }) => (
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
      bgcolor: isSelected ? highlightColors.selectedBg : "transparent",
      "&:hover": { bgcolor: highlightColors.hoverBg },
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
      {text}
    </Typography>
    {quote && (
      <Typography
        variant="microText"
        sx={{ color: "gray.50", mt: 0.5, fontStyle: "italic" }}
      >
        &quot;{quote}&quot;
      </Typography>
    )}
  </ButtonBase>
);

const EntityCard: FunctionComponent<{
  entry: RosterEntry;
  assertionWindows: AssertionWindow[];
  claims: ExtractedClaim[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
}> = ({ entry, assertionWindows, claims, selection, onSelect }) => {
  const [expanded, setExpanded] = useState(false);

  const selectedClaimId =
    selection?.kind === "claim" ? selection.claim.claimId : null;
  const selectedAssertionKey =
    selection?.kind === "assertion"
      ? getAssertionWindowKey(selection.window)
      : null;

  const itemCount =
    assertionWindows.length > 0 ? assertionWindows.length : claims.length;

  return (
    <Box>
      <ButtonBase
        onClick={() => setExpanded((wasExpanded) => !wasExpanded)}
        sx={{
          display: "flex",
          width: "100%",
          px: 2,
          py: 1.5,
          textAlign: "left",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
          "&:hover": { bgcolor: highlightColors.hoverBg },
        }}
      >
        <Stack direction="row" alignItems="center" gap={1} minWidth={0}>
          <Typography component="span" sx={{ flexShrink: 0 }}>
            {categoryIcons[entry.category ?? "other"]}
          </Typography>
          <Typography
            variant="smallTextLabels"
            sx={{
              fontWeight: expanded ? 600 : 400,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {entry.canonicalName}
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" gap={1} flexShrink={0}>
          {itemCount > 0 && (
            <Typography variant="microText" sx={{ color: "gray.50" }}>
              {itemCount}
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
        </Stack>
      </ButtonBase>

      <Collapse in={expanded}>
        {assertionWindows.length > 0 ? (
          assertionWindows.map((assertionWindow) => {
            const windowKey = getAssertionWindowKey(assertionWindow);
            const isSelected = selectedAssertionKey === windowKey;
            return (
              <EvidenceItem
                key={windowKey}
                text={assertionWindow.text}
                quote={assertionWindow.mentionSurface}
                isSelected={isSelected}
                onSelect={() =>
                  onSelect(
                    isSelected
                      ? null
                      : { kind: "assertion", window: assertionWindow },
                  )
                }
              />
            );
          })
        ) : claims.length > 0 ? (
          claims.map((claim) => {
            const isSelected = selectedClaimId === claim.claimId;
            const firstQuote = claim.evidenceRefs.at(0)?.quote;
            return (
              <EvidenceItem
                key={claim.claimId}
                text={claim.claimText}
                quote={firstQuote && `${firstQuote.substring(0, 80)}…`}
                isSelected={isSelected}
                onSelect={() =>
                  onSelect(isSelected ? null : { kind: "claim", claim })
                }
              />
            );
          })
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
  claims,
  mentionContexts,
  selection,
  onSelect,
}) => {
  const entityAssertionMap = useMemo(
    () => buildEntityAssertionMap(mentionContexts),
    [mentionContexts],
  );

  const claimsByEntity = useMemo(() => groupClaimsByEntity(claims), [claims]);

  return (
    <Stack
      sx={{
        width: 360,
        minWidth: 360,
        borderRight: ({ palette }) => `1px solid ${palette.gray[30]}`,
        overflowY: "auto",
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
            claims={claimsByEntity.get(entry.rosterEntryId) ?? []}
            selection={selection}
            onSelect={onSelect}
          />
        ))}
      </Box>
    </Stack>
  );
};
