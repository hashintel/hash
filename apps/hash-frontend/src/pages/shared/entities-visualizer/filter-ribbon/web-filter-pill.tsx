import { Box, Checkbox, Typography } from "@mui/material";

import { MenuItem } from "../../../../shared/ui";
import { FilterPill } from "./filter-pill";

import type { WebId } from "@blockprotocol/type-system";
import type { FunctionComponent } from "react";
import type { WebFilterState } from "./types";

export type WebFilterOption = {
  webId: WebId;
  label: string;
};

const summarise = ({
  options,
  filterState,
}: {
  options: WebFilterOption[];
  filterState: WebFilterState;
}): { summary: string; isActive: boolean } => {
  const allInternalSelected =
    filterState.selectedInternalWebIds.size === options.length;

  if (allInternalSelected && filterState.includeOtherWebs) {
    return { summary: "All", isActive: true };
  }

  if (allInternalSelected && !filterState.includeOtherWebs) {
    return { summary: "Your webs", isActive: false };
  }

  const selectedCount = filterState.selectedInternalWebIds.size;

  if (filterState.includeOtherWebs) {
    return {
      summary:
        selectedCount === 0
          ? "Other webs only"
          : `${selectedCount} + other webs`,
      isActive: true,
    };
  }

  if (selectedCount === 0) {
    return { summary: "None", isActive: true };
  }

  if (selectedCount === 1) {
    const onlySelected = [...filterState.selectedInternalWebIds][0];
    const match = options.find((option) => option.webId === onlySelected);
    return { summary: match?.label ?? "1 web", isActive: true };
  }

  return { summary: `${selectedCount} webs`, isActive: true };
};

export const WebFilterPill: FunctionComponent<{
  filterState: WebFilterState;
  setFilterState: (next: WebFilterState) => void;
  options: WebFilterOption[];
}> = ({ filterState, setFilterState, options }) => {
  const { summary, isActive } = summarise({ options, filterState });

  const toggle = (webId: WebId) => {
    const next = new Set(filterState.selectedInternalWebIds);
    if (next.has(webId)) {
      next.delete(webId);
    } else {
      next.add(webId);
    }
    setFilterState({ ...filterState, selectedInternalWebIds: next });
  };

  return (
    <FilterPill
      label="Web is"
      valueSummary={summary}
      isActive={isActive}
    >
      {() => (
        <Box sx={{ py: 0.5 }}>
          {options.map((option) => {
            const checked = filterState.selectedInternalWebIds.has(
              option.webId,
            );
            return (
              <MenuItem
                key={option.webId}
                onClick={() => toggle(option.webId)}
                sx={{ py: 0.5 }}
              >
                <Checkbox
                  checked={checked}
                  size="small"
                  sx={{ mr: 1, p: 0.25 }}
                />
                <Typography sx={{ fontSize: 13 }}>{option.label}</Typography>
              </MenuItem>
            );
          })}
          <Box
            sx={({ palette }) => ({
              borderTop: `1px solid ${palette.gray[20]}`,
              my: 0.5,
            })}
          />
          <MenuItem
            onClick={() =>
              setFilterState({
                ...filterState,
                includeOtherWebs: !filterState.includeOtherWebs,
              })
            }
            sx={{ py: 0.5 }}
          >
            <Checkbox
              checked={filterState.includeOtherWebs}
              size="small"
              sx={{ mr: 1, p: 0.25 }}
            />
            <Typography sx={{ fontSize: 13 }}>Other webs</Typography>
          </MenuItem>
        </Box>
      )}
    </FilterPill>
  );
};
