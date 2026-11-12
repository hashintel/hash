import { Box, Typography } from "@mui/material";
import { Fragment } from "react";

import { Button, Chip, Combobox, NumberInput } from "@hashintel/ds-components";

import { singularize } from "./shared/conversion-config";

import type { ConversionRowState } from "./shared/conversion-config";
import type { BaseUrl } from "@blockprotocol/type-system";
import type { ComboboxItem } from "@hashintel/ds-components";

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
  /**
   * Eligible conversion targets, excluding the viewed type and Number root.
   * A disabled target would require rewriting a conversion-group canonical
   * the user can't edit.
   */
  targetOptions: Array<{ baseUrl: BaseUrl; title: string; disabled?: boolean }>;
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
    // One grid across every row — unit, conversion, status — so the
    // columns line up whatever each target's width is
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "max-content max-content 1fr",
        columnGap: 1.25,
        rowGap: 1.5,
        alignItems: "center",
      }}
    >
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

        const targetItems: ComboboxItem<BaseUrl>[] = targetOptions
          .filter(
            (option) =>
              option.baseUrl === row.targetBaseUrl ||
              !usedTargets.has(option.baseUrl),
          )
          .map((option) => ({
            value: option.baseUrl,
            text: option.title,
            disabled: option.disabled,
          }));

        return (
          <Fragment key={row.key}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
              {row.formula ? (
                <Typography component="span" sx={{ fontSize: 14 }}>
                  {targetTitle}
                </Typography>
              ) : (
                <>
                  <Typography component="span" sx={{ fontSize: 14 }}>
                    1
                  </Typography>
                  {rowEditable && row.storedOnBaseUrl === null ? (
                    <Box sx={{ width: 220 }}>
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
                    <Typography
                      component="span"
                      sx={{ fontSize: 14, fontWeight: 500 }}
                    >
                      {singularize(targetTitle)}
                    </Typography>
                  )}
                </>
              )}
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
              {row.formula ? (
                <Typography
                  component="span"
                  sx={{
                    fontSize: 13,
                    color: ({ palette }) => palette.gray[60],
                  }}
                >
                  Converted by a formula, which this editor can’t change.
                </Typography>
              ) : (
                <>
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 14,
                      color: ({ palette }) => palette.gray[60],
                    }}
                  >
                    =
                  </Typography>
                  <NumberInput
                    value={row.value}
                    onChange={(value) => setRow(row.key, { value })}
                    min={Number.MIN_SAFE_INTEGER}
                    step="any"
                    hideStepper
                    readonly={!rowEditable}
                    size="sm"
                    width="xs"
                    placeholder="100"
                  />
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 14,
                      color: ({ palette }) => palette.gray[60],
                    }}
                  >
                    ×
                  </Typography>
                  <Typography component="span" sx={{ fontSize: 14 }}>
                    {`1 ${singularize(viewedTitle) || "unit"}`}
                  </Typography>
                </>
              )}
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
              {row.formula ? (
                <Chip size="xs" variant="soft" color="purple">
                  Formula
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
          </Fragment>
        );
      })}
    </Box>
  );
};
