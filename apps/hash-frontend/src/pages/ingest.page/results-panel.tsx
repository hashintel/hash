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
  Typography,
} from "@mui/material";
import type { FunctionComponent } from "react";
import { useMemo, useState } from "react";

import type { Selection } from "./evidence-resolver";
import {
  buildEntityAssertionMap,
  getAssertionWindowKey,
} from "./evidence-resolver";
import { highlightColors } from "./highlight-styles";
import type {
  AssertionWindow,
  ExtractedClaim,
  MentionContextPlan,
  RosterEntry,
} from "./types";

interface ResultsPanelProps {
  rosterEntries: RosterEntry[];
  claims: ExtractedClaim[];
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

const ClaimItem: FunctionComponent<{
  claim: ExtractedClaim;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ claim, isSelected, onSelect }) => {
  const firstEvidenceRef = claim.evidenceRefs.at(0);
  const quote = firstEvidenceRef
    ? firstEvidenceRef.quote.substring(0, 80)
    : undefined;

  return (
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
        {claim.claimText}
      </Typography>
      {quote && (
        <Typography
          variant="microText"
          sx={{ color: "gray.50", mt: 0.5, fontStyle: "italic" }}
        >
          &quot;{quote}…&quot;
        </Typography>
      )}
    </ButtonBase>
  );
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
        onClick={() => setExpanded((prev) => !prev)}
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
        <Box
          sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}
        >
          <Typography component="span" sx={{ flexShrink: 0 }}>
            {CATEGORY_ICONS[entry.category ?? "other"] ?? "◽"}
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
        </Box>
        <Box
          sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}
        >
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
        </Box>
      </ButtonBase>

      <Collapse in={expanded}>
        {assertionWindows.length > 0 ? (
          assertionWindows.map((win) => {
            const winKey = getAssertionWindowKey(win);
            const isWinSelected = selectedAssertionKey === winKey;
            return (
              <AssertionWindowItem
                key={winKey}
                window={win}
                isSelected={isWinSelected}
                onSelect={() =>
                  onSelect(
                    isWinSelected ? null : { kind: "assertion", window: win },
                  )
                }
              />
            );
          })
        ) : claims.length > 0 ? (
          claims.map((claim) => {
            const isClaimSelected = selectedClaimId === claim.claimId;
            return (
              <ClaimItem
                key={claim.claimId}
                claim={claim}
                isSelected={isClaimSelected}
                onSelect={() =>
                  onSelect(isClaimSelected ? null : { kind: "claim", claim })
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

  const claimsByEntity = useMemo(() => {
    const map = new Map<string, ExtractedClaim[]>();
    for (const claim of claims) {
      const existing = map.get(claim.rosterEntryId) ?? [];
      existing.push(claim);
      map.set(claim.rosterEntryId, existing);
    }
    return map;
  }, [claims]);

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
            claims={claimsByEntity.get(entry.rosterEntryId) ?? []}
            selection={selection}
            onSelect={onSelect}
          />
        ))}
      </Box>
    </Box>
  );
};
