import { Box, Typography } from "@mui/material";

import { Form, TextInput, Tooltip } from "@hashintel/ds-components";
import { ArrowTurnDownRightIcon } from "@hashintel/type-editor/src/entity-type-editor/shared/arrow-turn-down-right-icon";

import { DataTypeCard, SectionCard } from "./data-type-card";

/** The label the nearest ancestor supplies while this type sets none */
export type InheritedLabel = {
  left?: string;
  right?: string;
  fromTitle: string;
};

const describeInheritedLabel = (inherited: InheritedLabel): string =>
  [
    inherited.left ? `“${inherited.left}” before the value` : null,
    inherited.right ? `“${inherited.right}” after the value` : null,
  ]
    .filter(Boolean)
    .join(", ");

/**
 * The value-label card: text shown before and after displayed values. In
 * read-only view the card documents the labels that exist — an unset side is
 * omitted rather than shown as an empty disabled input, and with neither set
 * (and nothing inherited) the card has nothing to say.
 *
 * The graph's closed schema inherits the nearest ancestor's whole label when
 * a type sets none of its own, so the card marks that the way the
 * Constraints card marks inherited constraints: the turn-down arrow, plain
 * while inheriting and coloured once the type's own label overrides it.
 */
export const AppearanceCard = ({
  labelLeft,
  labelRight,
  onLabelLeftChange,
  onLabelRightChange,
  inheritedLabel,
  readonly,
}: {
  labelLeft: string;
  labelRight: string;
  onLabelLeftChange: (value: string) => void;
  onLabelRightChange: (value: string) => void;
  inheritedLabel?: InheritedLabel | null;
  readonly?: boolean;
}) => {
  const hasOwnLabel = labelLeft.trim() !== "" || labelRight.trim() !== "";
  // The closed schema takes the label wholesale: any own side replaces the
  // inherited pair entirely, rather than merging the missing side
  const overridden = hasOwnLabel && !!inheritedLabel;
  const inheriting = !hasOwnLabel && !!inheritedLabel;

  const shownLeft = inheriting ? (inheritedLabel.left ?? "") : labelLeft;
  const shownRight = inheriting ? (inheritedLabel.right ?? "") : labelRight;

  const showLabelLeft = !readonly || shownLeft.trim() !== "";
  const showLabelRight = !readonly || shownRight.trim() !== "";

  if (!showLabelLeft && !showLabelRight) {
    return null;
  }

  const inheritanceIndicator = inheritedLabel ? (
    <Tooltip
      content={
        overridden
          ? `Overwrites the label from ${inheritedLabel.fromTitle} — inherited label: ${describeInheritedLabel(inheritedLabel)}`
          : `Inherited from ${inheritedLabel.fromTitle}`
      }
    >
      <ArrowTurnDownRightIcon
        titleAccess={
          overridden
            ? "Overrides an inherited label"
            : `Inherited from ${inheritedLabel.fromTitle}`
        }
        sx={{
          flexShrink: 0,
          fill: ({ palette }) =>
            overridden ? palette.orange[60] : palette.gray[60],
        }}
      />
    </Tooltip>
  ) : null;

  return (
    <SectionCard>
      <Box sx={{ padding: "16px 18px 18px" }}>
        <DataTypeCard
          label="Appearance"
          description="Labels shown before and after the value"
        >
          <Box
            sx={{
              display: "flex",
              alignItems: readonly ? "baseline" : "flex-end",
              gap: 0.75,
            }}
          >
            {inheritanceIndicator ? (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  // Centres the icon against the inputs under their labels
                  height: readonly ? "auto" : 28,
                }}
              >
                {inheritanceIndicator}
              </Box>
            ) : null}
            {readonly ? (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "max-content max-content",
                  columnGap: 2,
                  rowGap: 0.5,
                  alignItems: "baseline",
                }}
              >
                {showLabelLeft ? (
                  <>
                    <Typography
                      sx={{ fontSize: 14, fontWeight: 600, color: "#404040" }}
                    >
                      Before the value:
                    </Typography>
                    <Typography sx={{ fontSize: 14, color: "#404040" }}>
                      {shownLeft}
                    </Typography>
                  </>
                ) : null}
                {showLabelRight ? (
                  <>
                    <Typography
                      sx={{ fontSize: 14, fontWeight: 600, color: "#404040" }}
                    >
                      After the value:
                    </Typography>
                    <Typography sx={{ fontSize: 14, color: "#404040" }}>
                      {shownRight}
                    </Typography>
                  </>
                ) : null}
              </Box>
            ) : (
              <Box sx={{ display: "flex", gap: 2 }}>
                <Form.Field label="Before the value" size="sm">
                  <TextInput
                    value={labelLeft}
                    onChange={onLabelLeftChange}
                    placeholder={
                      inheriting && inheritedLabel.left
                        ? inheritedLabel.left
                        : "£"
                    }
                    size="sm"
                    width="xs"
                  />
                </Form.Field>
                <Form.Field label="After the value" size="sm">
                  <TextInput
                    value={labelRight}
                    onChange={onLabelRightChange}
                    placeholder={
                      inheriting && inheritedLabel.right
                        ? inheritedLabel.right
                        : "cm"
                    }
                    size="sm"
                    width="xs"
                  />
                </Form.Field>
              </Box>
            )}
          </Box>
        </DataTypeCard>
      </Box>
    </SectionCard>
  );
};
