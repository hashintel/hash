/**
 * Results panel: roster entries + claims list with click-to-highlight.
 *
 * Left-side panel in the ingest results view.
 */
import {
  Box,
  ButtonBase,
  List,
  ListSubheader,
  Typography,
} from "@mui/material";
import type { FunctionComponent } from "react";

import type { Selection } from "./evidence-resolver";
import type { ExtractedClaim, RosterEntry } from "./types";

interface ResultsPanelProps {
  rosterEntries: RosterEntry[];
  claims: ExtractedClaim[];
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

export const ResultsPanel: FunctionComponent<ResultsPanelProps> = ({
  rosterEntries,
  claims,
  selection,
  onSelect,
}) => {
  const isRosterSelected = (entry: RosterEntry) =>
    selection?.kind === "roster" &&
    selection.entry.rosterEntryId === entry.rosterEntryId;

  const isClaimSelected = (claim: ExtractedClaim) =>
    selection?.kind === "claim" && selection.claim.claimId === claim.claimId;

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
      {/* Roster section */}
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
        Roster ({rosterEntries.length})
      </ListSubheader>
      <List disablePadding sx={{ flex: "0 0 auto" }}>
        {rosterEntries.map((entry) => {
          const selected = isRosterSelected(entry);
          return (
            <ButtonBase
              key={entry.rosterEntryId}
              onClick={() =>
                onSelect(selected ? null : { kind: "roster", entry })
              }
              sx={{
                display: "block",
                width: "100%",
                px: 2,
                py: 1,
                textAlign: "left",
                borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
                bgcolor: selected ? "rgba(59, 130, 246, 0.08)" : "transparent",
                "&:hover": { bgcolor: "rgba(59, 130, 246, 0.04)" },
              }}
            >
              <Typography variant="smallTextLabels" component="span">
                <span style={{ marginRight: "0.5rem" }}>
                  {CATEGORY_ICONS[entry.category ?? "other"] ?? "◽"}
                </span>
                <span style={{ fontWeight: selected ? 600 : 400 }}>
                  {entry.canonicalName}
                </span>
              </Typography>
              <Typography
                variant="microText"
                component="div"
                sx={{ color: "gray.60", mt: 0.25, pl: 3 }}
              >
                {entry.mentions.length} mention
                {entry.mentions.length !== 1 ? "s" : ""}
              </Typography>
            </ButtonBase>
          );
        })}
      </List>

      {/* Claims section */}
      <ListSubheader
        sx={{
          px: 2,
          py: 1.5,
          borderTop: ({ palette }) => `1px solid ${palette.gray[30]}`,
          borderBottom: ({ palette }) => `1px solid ${palette.gray[30]}`,
          mt: 1,
          fontSize: "0.75rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          lineHeight: 1,
        }}
      >
        Claims ({claims.length})
      </ListSubheader>
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {rosterEntries.map((entry) => {
          const entryClaims = claims.filter(
            (claim) => claim.rosterEntryId === entry.rosterEntryId,
          );
          if (entryClaims.length === 0) {
            return null;
          }
          return (
            <Box key={`claims-${entry.rosterEntryId}`}>
              <Box
                sx={{
                  px: 2,
                  py: 0.75,
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  color: "gray.60",
                  borderBottom: ({ palette }) =>
                    `1px solid ${palette.gray[20]}`,
                  bgcolor: "rgba(0, 0, 0, 0.02)",
                }}
              >
                {CATEGORY_ICONS[entry.category ?? "other"] ?? "◽"}{" "}
                {entry.canonicalName} ({entryClaims.length})
              </Box>
              {entryClaims.map((claim) => {
                const selected = isClaimSelected(claim);
                const firstEvidenceRef = claim.evidenceRefs.at(0);
                const quote = firstEvidenceRef
                  ? firstEvidenceRef.quote.substring(0, 60)
                  : undefined;
                return (
                  <ButtonBase
                    key={claim.claimId}
                    onClick={() =>
                      onSelect(selected ? null : { kind: "claim", claim })
                    }
                    sx={{
                      display: "block",
                      width: "100%",
                      px: 2,
                      py: 1,
                      pl: 3,
                      textAlign: "left",
                      borderBottom: ({ palette }) =>
                        `1px solid ${palette.gray[20]}`,
                      bgcolor: selected
                        ? "rgba(59, 130, 246, 0.08)"
                        : "transparent",
                      "&:hover": { bgcolor: "rgba(59, 130, 246, 0.04)" },
                    }}
                  >
                    <Typography
                      variant="smallTextLabels"
                      sx={{ fontWeight: selected ? 600 : 400 }}
                    >
                      {claim.claimText}
                    </Typography>
                    {quote && (
                      <Typography
                        variant="microText"
                        sx={{
                          color: "gray.50",
                          mt: 0.5,
                          fontStyle: "italic",
                        }}
                      >
                        &quot;{quote}…&quot;
                      </Typography>
                    )}
                  </ButtonBase>
                );
              })}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
