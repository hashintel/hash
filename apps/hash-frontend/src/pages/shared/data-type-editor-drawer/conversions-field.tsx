import { Box, Typography } from "@mui/material";

import {
  Button,
  Chip,
  Combobox,
  NumberInput,
  Select,
} from "@hashintel/ds-components";

import { singularize } from "./shared/conversion-config";

import type { ConversionRowState } from "./shared/conversion-config";
import type { BaseUrl } from "@blockprotocol/type-system";
import type { ComboboxItem, SelectItem } from "@hashintel/ds-components";

const operatorItems: SelectItem<ConversionRowState["operator"]>[] = [
  { value: "multiply", text: "×" },
  { value: "divide", text: "÷" },
];

export const ConversionsField = ({
  rows,
  onChange,
  viewedTitle,
  targetOptions,
  resolveTitle,
  canEditStoredOn,
  readonly,
}: {
  rows: ConversionRowState[];
  onChange: (rows: ConversionRowState[]) => void;
  viewedTitle: string;
  /** Eligible conversion targets, excluding the viewed type and Number root */
  targetOptions: Array<{ baseUrl: BaseUrl; title: string }>;
  resolveTitle: (baseUrl: BaseUrl) => string;
  canEditStoredOn: (storedOnBaseUrl: BaseUrl) => boolean;
  readonly?: boolean;
}) => {
  const setRow = (key: string, patch: Partial<ConversionRowState>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const usedTargets = new Set(
    rows.map((row) => row.targetBaseUrl).filter(Boolean),
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {rows.map((row) => {
        const targetTitle = row.targetBaseUrl
          ? resolveTitle(row.targetBaseUrl)
          : "target";

        const rowEditable =
          !readonly &&
          !row.viaCanonical &&
          !row.formula &&
          (row.storedOnBaseUrl === null ||
            canEditStoredOn(row.storedOnBaseUrl));

        /**
         * Permission blocks the row: its stored entry sits on a type the
         * user can't edit — including the viewed type itself — or it is
         * presented from a viewed type the user can't edit.
         */
        const permissionBlocked =
          row.storedOnBaseUrl !== null
            ? !canEditStoredOn(row.storedOnBaseUrl)
            : row.viaCanonical && !!readonly;

        const targetItems: ComboboxItem<BaseUrl>[] = targetOptions
          .filter(
            (option) =>
              option.baseUrl === row.targetBaseUrl ||
              !usedTargets.has(option.baseUrl),
          )
          .map((option) => ({ value: option.baseUrl, text: option.title }));

        return (
          <Box key={row.key}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                marginBottom: 1,
              }}
            >
              <Typography
                component="span"
                sx={{
                  fontSize: 14,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  color: ({ palette }) => palette.gray[80],
                }}
              >
                Converts to
              </Typography>
              {rowEditable && row.storedOnBaseUrl === null ? (
                <Box sx={{ width: 240 }}>
                  <Combobox<BaseUrl>
                    items={targetItems}
                    value={row.targetBaseUrl}
                    onChange={(targetBaseUrl) =>
                      setRow(row.key, { targetBaseUrl })
                    }
                    placeholder="Choose a data type"
                    size="sm"
                    width="fullWidth"
                  />
                </Box>
              ) : (
                <Typography component="span" sx={{ fontSize: 14 }}>
                  {targetTitle}
                </Typography>
              )}
              {row.formula ? (
                <Chip size="xs" variant="soft" color="purple">
                  Formula
                </Chip>
              ) : permissionBlocked ? (
                <Chip size="xs" variant="soft" color="grey">
                  No permission to edit
                </Chip>
              ) : null}
              {rowEditable ? (
                <Box sx={{ marginLeft: "auto" }}>
                  <Button
                    variant="ghost"
                    size="xs"
                    iconName="close"
                    tooltip="Remove conversion"
                    onClick={() =>
                      onChange(rows.filter((other) => other.key !== row.key))
                    }
                  />
                </Box>
              ) : null}
            </Box>

            {row.formula ? (
              <Typography
                sx={{ fontSize: 13, color: ({ palette }) => palette.gray[60] }}
              >
                Converted by a formula, which this editor can’t change.
              </Typography>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  padding: "8px 12px",
                  background: "#fafafa",
                  border: ({ palette }) => `1px solid ${palette.gray[20]}`,
                  borderRadius: "8px",
                }}
              >
                <Typography component="span" sx={{ fontSize: 14 }}>
                  {`1 ${singularize(viewedTitle) || "unit"}`}
                </Typography>
                <Select<ConversionRowState["operator"]>
                  items={operatorItems}
                  value={row.operator}
                  required
                  onChange={(operator) => setRow(row.key, { operator })}
                  disabled={!rowEditable}
                  size="sm"
                  width="fitContent"
                />
                <NumberInput
                  value={row.value}
                  onChange={(value) => setRow(row.key, { value })}
                  min={Number.MIN_SAFE_INTEGER}
                  step="any"
                  hideStepper
                  disabled={!rowEditable}
                  size="sm"
                  width="xs"
                  placeholder="0.01"
                />
                <Typography
                  component="span"
                  sx={{
                    fontSize: 14,
                    color: ({ palette }) => palette.gray[60],
                  }}
                >
                  =
                </Typography>
                <Typography component="span" sx={{ fontSize: 14 }}>
                  {targetTitle}
                </Typography>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};
