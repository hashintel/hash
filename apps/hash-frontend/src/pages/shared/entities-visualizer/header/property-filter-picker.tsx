import { Box, ListItemText, Tooltip, Typography } from "@mui/material";
import { useMemo, useState } from "react";

import {
  CaretDownSolidIcon,
  IconButton,
  TextField,
} from "@hashintel/design-system";

import { MenuItem } from "../../../../shared/ui";

import type {
  FilterableProperty,
  FilterValueKind,
  PropertyFilterDisabledReason,
} from "../data/property-filters/types";
import type { BaseUrl } from "@blockprotocol/type-system";
import type { FunctionComponent } from "react";

const disabledReasonTooltip: Record<PropertyFilterDisabledReason, string> = {
  "multiple-data-types":
    "Properties with multiple possible data types can’t be filtered yet.",
  list: "List properties can’t be filtered yet.",
  nested: "Nested properties can’t be filtered yet.",
};

type SelectableProperty = {
  baseUrl: BaseUrl;
  title: string;
  kind: FilterValueKind;
};

type PropertyFilterPickerProps = {
  properties: FilterableProperty[];
  loading: boolean;
  onBack: () => void;
  onSelect: (property: SelectableProperty) => void;
};

const PickerMessage: FunctionComponent<{ text: string }> = ({ text }) => (
  <Box sx={{ px: 1.5, py: 1, minWidth: 220 }}>
    <Typography sx={{ color: ({ palette }) => palette.gray[60], fontSize: 13 }}>
      {text}
    </Typography>
  </Box>
);

export const PropertyFilterPicker: FunctionComponent<
  PropertyFilterPickerProps
> = ({ properties, loading, onBack, onSelect }) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProperties = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return properties;
    }
    return properties.filter((property) =>
      property.title.toLowerCase().includes(query),
    );
  }, [properties, searchQuery]);

  const renderList = () => {
    if (filteredProperties.length === 0) {
      if (loading && properties.length === 0) {
        return <PickerMessage text="Loading…" />;
      }
      return (
        <PickerMessage
          text={
            properties.length === 0 ? "No filterable properties" : "No matches"
          }
        />
      );
    }

    return filteredProperties.map((property) => {
      if (property.filterable) {
        return (
          <MenuItem
            key={property.baseUrl}
            onClick={() =>
              onSelect({
                baseUrl: property.baseUrl,
                title: property.title,
                kind: property.kind,
              })
            }
            sx={{ minWidth: 280 }}
          >
            <ListItemText
              primary={property.title}
              primaryTypographyProps={{
                sx: {
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                },
              }}
            />
          </MenuItem>
        );
      }

      return (
        <Tooltip
          key={property.baseUrl}
          title={disabledReasonTooltip[property.disabledReason]}
          placement="right"
        >
          <Box
            sx={{
              minWidth: 280,
              px: 2,
              py: 0.75,
              cursor: "default",
            }}
          >
            <Typography
              sx={{
                fontSize: 14,
                color: ({ palette }) => palette.gray[50],
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {property.title}
            </Typography>
          </Box>
        </Tooltip>
      );
    });
  };

  return (
    <>
      <Box
        sx={{
          px: 1.25,
          pt: 1,
          pb: 0.75,
          position: "sticky",
          top: 0,
          background: ({ palette }) => palette.common.white,
          zIndex: 1,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            mb: 0.75,
          }}
        >
          <IconButton
            size="small"
            onClick={onBack}
            aria-label="Back to filters"
            sx={{ p: 0.25 }}
          >
            <CaretDownSolidIcon
              sx={{ fontSize: 14, transform: "rotate(90deg)" }}
            />
          </IconButton>
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 600,
              color: ({ palette }) => palette.gray[70],
            }}
          >
            Filter by property
          </Typography>
        </Box>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder="Search properties…"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            // Prevent MUI Menu auto-focus / typeahead from stealing keys.
            event.stopPropagation();
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              fontSize: 13,
            },
            "& .MuiOutlinedInput-input": {
              py: 0.75,
            },
          }}
        />
      </Box>
      {renderList()}
    </>
  );
};
