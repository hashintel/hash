import {
  Form,
  Icon,
  NumberInput,
  Select,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { usePetrinautMutations } from "../../../../../../../react";
import { useIsReadOnly } from "../../../../../../../react/editing/use-is-read-only";
import { useEditorActions } from "../../../../../../../react/state/editor-context";
import { PropertyValue } from "../../../../../../components/property-value";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { DeleteItemButton } from "../../delete-item-button";
import { fieldsSectionStyle } from "../../styles";
import { useArcPropertiesContext } from "../context";

import type { InputArc } from "@hashintel/petrinaut-core";

export const ArcIcon = () => <Icon name="scribble" />;

const arcTypeLabels: Record<InputArc["type"], string> = {
  standard: "Standard",
  read: "Read",
  inhibitor: "Inhibitor",
};

const readOnlyFieldStyle = css({
  fontSize: "sm",
  color: "neutral.s110",
});

export const ArcMainContent: React.FC = () => {
  const {
    transitionId,
    endpoint,
    arcDirection,
    sourceName,
    targetName,
    weight,
    type,
  } = useArcPropertiesContext();
  const { updateArcWeight, updateArcType } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();

  return (
    <Form.Section className={fieldsSectionStyle}>
      <Form.Field label="Source" size="sm">
        <div className={readOnlyFieldStyle}>{sourceName}</div>
      </Form.Field>
      <Form.Field label="Target" size="sm">
        <div className={readOnlyFieldStyle}>{targetName}</div>
      </Form.Field>
      {arcDirection === "input" && (
        <Form.Field label="Type" size="sm">
          <PropertyValue text={arcTypeLabels[type]}>
            <Tooltip
              content={UI_MESSAGES.READ_ONLY_MODE}
              disableTooltip={!isReadOnly}
            >
              <Select
                required
                value={type}
                size="sm"
                onChange={(nextType: InputArc["type"]) => {
                  updateArcType({
                    transitionId,
                    endpoint,
                    type: nextType,
                  });
                }}
                items={Object.entries(arcTypeLabels).map(([value, text]) => ({
                  value: value as InputArc["type"],
                  text,
                }))}
              />
            </Tooltip>
          </PropertyValue>
        </Form.Field>
      )}
      <Form.Field label="Weight" size="sm">
        <PropertyValue text={String(weight)}>
          <NumberInput
            size="sm"
            min={1}
            value={weight}
            onChange={(nextWeight) => {
              if (nextWeight !== null && nextWeight > 0) {
                updateArcWeight({
                  transitionId,
                  arcDirection,
                  endpoint,
                  weight: nextWeight,
                });
              }
            }}
          />
        </PropertyValue>
      </Form.Field>
    </Form.Section>
  );
};

export const DeleteArcAction: React.FC = () => {
  const { transitionId, endpoint, arcDirection } = useArcPropertiesContext();
  const { removeArc } = usePetrinautMutations();
  const { clearSelection } = useEditorActions();

  return (
    <DeleteItemButton
      label="Delete arc"
      onDelete={() => {
        removeArc({ transitionId, arcDirection, endpoint });
        clearSelection();
      }}
    />
  );
};
