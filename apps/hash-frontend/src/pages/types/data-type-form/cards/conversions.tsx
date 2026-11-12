import { Box, Typography } from "@mui/material";
import { Fragment } from "react";

import { Button, Chip, NumberInput, Select } from "@hashintel/ds-components";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";

import { conversionExpressionParts } from "../conversion-util";
import { DataTypeCard, SectionCard } from "./data-type-card";

import type {
  ConversionOperator,
  ConversionRowState,
  GroupConversionRowState,
} from "../conversion-util";
import type { BaseUrl, Conversions } from "@blockprotocol/type-system";
import type { SelectItem } from "@hashintel/ds-components";

const operatorItems: SelectItem<ConversionOperator>[] = [
  { value: "*", text: "×" },
  { value: "/", text: "÷" },
  { value: "+", text: "+" },
  { value: "-", text: "−" },
];

const operatorSymbols: Record<ConversionOperator, string> = {
  "*": "×",
  "/": "÷",
  "+": "+",
  "-": "−",
};

/** Sized against the md type chips (22px tall, 12px label) in the same rows */
const conversionTextSx = { fontSize: 14, lineHeight: "22px" } as const;

/**
 * A capped-width type name in an equation: the operator and value follow, so
 * a long title truncates rather than pushing them away
 */
const conversionTitleSx = {
  ...conversionTextSx,
  fontWeight: 500,
  maxWidth: 200,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

const equalsSign = (
  <Typography
    component="span"
    sx={{ ...conversionTextSx, color: ({ palette }) => palette.gray[60] }}
  >
    =
  </Typography>
);

/** An unresolved reference shows its slug as a name, never the raw URL */
const typeRefLabel = (title: string): string => {
  if (!/^https?:\/\//.test(title)) {
    return title;
  }
  const slug = title.split("/").filter(Boolean).at(-1) ?? title;
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/** A data-type reference in a read-only conversion */
const TypeChip = ({
  title,
  maxWidth = 200,
}: {
  title: string;
  maxWidth?: number;
}) => (
  <Chip size="md" variant="soft">
    {/* inline-block: a block here would push the chip's leading
        zero-width-space onto its own line, doubling the pill's height */}
    <Box
      component="span"
      sx={{
        display: "inline-block",
        verticalAlign: "bottom",
        maxWidth,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {typeRefLabel(title)}
    </Box>
  </Chip>
);

/** A stored formula, printed as an equation in the target's units */
const FormulaExpression = ({
  conversions,
  targetTitle,
}: {
  conversions: Conversions | null | undefined;
  targetTitle: string;
}) =>
  conversions ? (
    <>
      {equalsSign}
      <Box
        component="span"
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 0.5,
        }}
      >
        {conversionExpressionParts(conversions.from.expression).map(
          (part, index) =>
            part.kind === "self" ? (
              // The parts never reorder: the list is a pure render of the
              // stored expression. Tighter cap than a lone target: formulas
              // can hold several references.
              // eslint-disable-next-line react/no-array-index-key
              <TypeChip key={index} title={targetTitle} maxWidth={160} />
            ) : (
              // eslint-disable-next-line react/no-array-index-key
              <Typography key={index} component="span" sx={conversionTextSx}>
                {part.text.trim()}
              </Typography>
            ),
        )}
      </Box>
    </>
  ) : (
    <Typography
      component="span"
      sx={{ ...conversionTextSx, color: ({ palette }) => palette.gray[60] }}
    >
      Converted by a formula, which this editor can’t change.
    </Typography>
  );

/** The "target op value" tail of a conversion equation, shared by both cards */
const ConversionExpression = ({
  operator,
  value,
  editable,
  onOperatorChange,
  onValueChange,
}: {
  operator: ConversionOperator;
  value: number | null;
  editable: boolean;
  onOperatorChange: (operator: ConversionOperator) => void;
  onValueChange: (value: number | null) => void;
}) => (
  <>
    {editable ? (
      <Select<ConversionOperator>
        items={operatorItems}
        value={operator}
        onChange={onOperatorChange}
        required
        size="sm"
        width="fitContent"
        hideArrow
      />
    ) : (
      <Typography
        component="span"
        sx={{ ...conversionTextSx, color: ({ palette }) => palette.gray[60] }}
      >
        {operatorSymbols[operator]}
      </Typography>
    )}
    {editable ? (
      <NumberInput
        value={value}
        onChange={onValueChange}
        min={Number.MIN_SAFE_INTEGER}
        step="any"
        hideStepper
        size="sm"
        width="xs"
        placeholder="100"
      />
    ) : (
      // Printed in the user's locale, as the input renders while editing
      <Typography component="span" sx={conversionTextSx}>
        {value === null ? "" : formatNumber(value)}
      </Typography>
    )}
  </>
);

/**
 * The conversions card of a type group: the group is abstract, so these are
 * its concrete members' pairings, grouped into a section per conversion
 * family. Each row reads "member = target × value".
 */
const GroupConversionRows = ({
  rows,
  onChange,
  childOptions,
  targetOptionsFor,
  resolveTitle,
  sectionKeyFor,
  canEditStoredOn,
  readonly,
}: {
  rows: GroupConversionRowState[];
  onChange: (rows: GroupConversionRowState[]) => void;
  /**
   * The group's concrete members, for a new row's unit pick. A disabled
   * member can't take a new pairing — storing one would republish it.
   */
  childOptions: Array<{ baseUrl: BaseUrl; title: string; disabled?: boolean }>;
  /** Eligible targets for a member's new pairing, planner-gated */
  targetOptionsFor: (
    childBaseUrl: BaseUrl,
  ) => Array<{ baseUrl: BaseUrl; title: string; disabled?: boolean }>;
  resolveTitle: (baseUrl: BaseUrl) => string;
  /** The conversion family a row belongs to — null for unplaced new rows */
  sectionKeyFor: (row: GroupConversionRowState) => BaseUrl | null;
  canEditStoredOn: (storedOnBaseUrl: BaseUrl) => boolean;
  readonly?: boolean;
}) => {
  const setRow = (key: string, patch: Partial<GroupConversionRowState>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  // One block per conversion family, separated only by whitespace. Rows
  // added this session sit together in a trailing block — sorted into their
  // families on the next open — unless there is a single family (or none),
  // where splitting them out would read as noise.
  const familySections = new Map<string, GroupConversionRowState[]>();
  const newRows: GroupConversionRowState[] = [];
  for (const row of rows) {
    if (row.key.startsWith("new-")) {
      newRows.push(row);
      continue;
    }
    const sectionKey = sectionKeyFor(row) ?? "";
    const section = familySections.get(sectionKey) ?? [];
    section.push(row);
    familySections.set(sectionKey, section);
  }

  const orderedSections = [...familySections.values()];
  if (newRows.length > 0) {
    if (orderedSections.length > 1) {
      orderedSections.push(newRows);
    } else if (orderedSections[0]) {
      orderedSections[0] = [...orderedSections[0], ...newRows];
    } else {
      orderedSections.push(newRows);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.125 }}>
      {orderedSections.map((sectionRows, sectionIndex) => (
        <Box
          key={sectionRows[0]?.key ?? sectionIndex}
          sx={
            // The divider sits centred in the old 18px section gap
            sectionIndex > 0
              ? ({ palette }) => ({
                  borderTop: `1px solid ${palette.gray[20]}`,
                  paddingTop: 1.125,
                })
              : undefined
          }
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "max-content max-content 1fr",
              // Every row control-height so text and input rows share one
              // rhythm; the gap narrows to keep the read-only text spacing
              gridAutoRows: "minmax(28px, auto)",
              columnGap: 1.25,
              rowGap: 0.625,
              alignItems: "center",
            }}
          >
            {sectionRows.map((row) => {
              const rowEditable =
                !readonly &&
                !row.viaCanonical &&
                !row.formula &&
                (row.storedOnBaseUrl === null ||
                  canEditStoredOn(row.storedOnBaseUrl));
              const isNew = row.storedOnBaseUrl === null && !row.viaCanonical;

              const childTitle = row.childBaseUrl
                ? resolveTitle(row.childBaseUrl)
                : null;
              const targetTitle = row.targetBaseUrl
                ? resolveTitle(row.targetBaseUrl)
                : null;

              // Only an editable new row offers a picker — saved, composed
              // and read-only rows must not enumerate targets, which runs
              // per-target save planning over every public numeric type
              const targetItems =
                isNew && rowEditable && row.childBaseUrl
                  ? targetOptionsFor(row.childBaseUrl)
                      // The member's other pairings are taken; this row's own
                      // pick stays offered
                      .filter(
                        (option) =>
                          option.baseUrl === row.targetBaseUrl ||
                          !rows.some(
                            (other) =>
                              other.key !== row.key &&
                              other.childBaseUrl === row.childBaseUrl &&
                              other.targetBaseUrl === option.baseUrl,
                          ),
                      )
                      .map((option) => ({
                        value: option.baseUrl,
                        text: option.title,
                        disabled: option.disabled,
                      }))
                  : [];

              return (
                <Fragment key={row.key}>
                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: 1.25 }}
                  >
                    {isNew && rowEditable ? (
                      <Box sx={{ width: 200 }}>
                        <Select<BaseUrl>
                          items={childOptions.map((option) => ({
                            value: option.baseUrl,
                            text: option.title,
                            disabled: option.disabled,
                          }))}
                          value={row.childBaseUrl}
                          onChange={(childBaseUrl) =>
                            // The target pool is per-member: a pick made for
                            // the old member may not be offerable for the new
                            setRow(row.key, {
                              childBaseUrl,
                              targetBaseUrl: null,
                            })
                          }
                          placeholder="Choose a member"
                          size="sm"
                          width="fullWidth"
                          searchable={childOptions.length >= 7}
                        />
                      </Box>
                    ) : (
                      <Typography component="span" sx={conversionTitleSx}>
                        {childTitle ?? "member"}
                      </Typography>
                    )}
                  </Box>

                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: 1.25 }}
                  >
                    {row.formula ? (
                      <FormulaExpression
                        conversions={row.conversions}
                        targetTitle={targetTitle ?? "target"}
                      />
                    ) : isNew && row.childBaseUrl === null ? null : ( // The equation follows once the member is picked
                      <>
                        {equalsSign}
                        {isNew && rowEditable ? (
                          <Box sx={{ width: 200 }}>
                            <Select<BaseUrl>
                              items={targetItems}
                              value={row.targetBaseUrl}
                              onChange={(targetBaseUrl) =>
                                setRow(row.key, { targetBaseUrl })
                              }
                              placeholder="Choose a data type"
                              size="sm"
                              width="fullWidth"
                              searchable={targetItems.length >= 7}
                            />
                          </Box>
                        ) : rowEditable ? (
                          <Typography component="span" sx={conversionTitleSx}>
                            {targetTitle ?? "target"}
                          </Typography>
                        ) : (
                          <TypeChip title={targetTitle ?? "target"} />
                        )}
                        <ConversionExpression
                          operator={row.operator}
                          value={row.value}
                          editable={rowEditable}
                          onOperatorChange={(operator) =>
                            setRow(row.key, { operator })
                          }
                          onValueChange={(value) => setRow(row.key, { value })}
                        />
                      </>
                    )}
                  </Box>

                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: 1.25 }}
                  >
                    {rowEditable ? (
                      <Box sx={{ marginLeft: "auto" }}>
                        <Button
                          variant="ghost"
                          size="xs"
                          iconName="close"
                          tooltip="Remove conversion"
                          onClick={() =>
                            onChange(
                              rows.filter((other) => other.key !== row.key),
                            )
                          }
                        />
                      </Box>
                    ) : null}
                  </Box>
                </Fragment>
              );
            })}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

const ConversionRows = ({
  rows,
  onChange,
  viewedTitle,
  targetOptions,
  resolveTitle,
  canEditStoredOn,
  canRemoveComposed,
  onRemoveComposed,
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
  /**
   * Whether a composed (via-canonical) pairing may be removed — severing
   * the target from the group republishes every type storing one of its
   * edges, so this is an edit-permission check on all of them
   */
  canRemoveComposed?: (targetBaseUrl: BaseUrl) => boolean;
  /** Composed removals confirm first: the caller owns the dialog */
  onRemoveComposed?: (row: ConversionRowState) => void;
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
        gridAutoRows: "minmax(28px, auto)",
        columnGap: 1.25,
        rowGap: 0.625,
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

        const targetItems: SelectItem<BaseUrl>[] = targetOptions
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
            <Typography component="span" sx={conversionTitleSx}>
              {viewedTitle || "This type"}
            </Typography>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
              {row.formula ? (
                <FormulaExpression
                  conversions={row.conversions}
                  targetTitle={targetTitle}
                />
              ) : (
                <>
                  {equalsSign}
                  {rowEditable && row.storedOnBaseUrl === null ? (
                    <Box sx={{ width: 220 }}>
                      <Select<BaseUrl>
                        items={targetItems}
                        value={row.targetBaseUrl}
                        onChange={(targetBaseUrl) =>
                          setRow(row.key, { targetBaseUrl })
                        }
                        placeholder="Choose a data type"
                        size="sm"
                        width="fullWidth"
                        searchable={targetItems.length >= 7}
                      />
                    </Box>
                  ) : rowEditable ? (
                    <Typography component="span" sx={conversionTitleSx}>
                      {targetTitle}
                    </Typography>
                  ) : (
                    <TypeChip title={targetTitle} />
                  )}
                  <ConversionExpression
                    operator={row.operator}
                    value={row.value}
                    editable={rowEditable}
                    onOperatorChange={(operator) =>
                      setRow(row.key, { operator })
                    }
                    onValueChange={(value) => setRow(row.key, { value })}
                  />
                </>
              )}
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
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
              ) : !readonly &&
                row.viaCanonical &&
                row.targetBaseUrl !== null &&
                canRemoveComposed?.(row.targetBaseUrl) ? (
                <Box sx={{ marginLeft: "auto" }}>
                  <Button
                    variant="ghost"
                    size="xs"
                    iconName="close"
                    tooltip="Remove conversion"
                    onClick={() => onRemoveComposed?.(row)}
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

/**
 * The framed Conversions card for a concrete number type: its conversion
 * rows, with the add-row action in the card header.
 */
export const ConversionsCard = ({
  error,
  addRow,
  ...rowProps
}: {
  error?: string;
  /** Appends a new empty row — omitted when adding isn't offered */
  addRow?: () => void;
} & Parameters<typeof ConversionRows>[0]) => (
  <SectionCard>
    <Box sx={{ padding: "16px 18px 18px" }}>
      <DataTypeCard
        label="Conversions"
        description="Convert values of this type to other data types."
        errors={error ? [error] : undefined}
        actions={
          addRow ? (
            <Button variant="subtle" size="sm" iconName="plus" onClick={addRow}>
              Add conversion
            </Button>
          ) : undefined
        }
      >
        <ConversionRows {...rowProps} />
      </DataTypeCard>
    </Box>
  </SectionCard>
);

/**
 * The framed Conversions card for a group: the concrete members' rows across
 * the connected family, with the add-row action in the card header.
 */
export const GroupConversionsCard = ({
  error,
  addRow,
  ...rowProps
}: {
  error?: string;
  /** Appends a new empty row — omitted when adding isn't offered */
  addRow?: () => void;
} & Parameters<typeof GroupConversionRows>[0]) => (
  <SectionCard>
    <Box sx={{ padding: "16px 18px 18px" }}>
      <DataTypeCard
        label="Conversions"
        description="Convert values of this group’s members to other data types."
        errors={error ? [error] : undefined}
        actions={
          addRow ? (
            <Button variant="subtle" size="sm" iconName="plus" onClick={addRow}>
              Add conversion
            </Button>
          ) : undefined
        }
      >
        <GroupConversionRows {...rowProps} />
      </DataTypeCard>
    </Box>
  </SectionCard>
);
