import { useState } from "react";

import { Button, Dialog, Icon, Menu, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  DEFAULT_DIFFERENTIAL_EQUATION_CODE,
  generateDefaultDifferentialEquationCode,
  validateDisplayName,
} from "@hashintel/petrinaut-core";

import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { DraftFieldInput } from "../../../../../../components/draft-field-input";
import { Section, SectionList } from "../../../../../../components/section";
import { Select } from "../../../../../../components/select";
import { DifferentialEquationIcon } from "../../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { CodeEditor } from "../../../../../../monaco/code-editor";
import { getDocumentUri } from "../../../../../../monaco/editor-paths";
import { useDiffEqPropertiesContext } from "../context";

import type { SubView } from "../../../../../../components/sub-view/types";

const colorDotStyle = css({
  width: "[12px]",
  height: "[12px]",
  borderRadius: "[50%]",
  flexShrink: 0,
});

const confirmTextStyle = css({
  fontSize: "sm",
  color: "neutral.s90",
  marginBottom: "3",
});

const confirmListStyle = css({
  fontSize: "[13px]",
  color: "neutral.s90",
  marginBottom: "3",
  paddingLeft: "[20px]",
});

const confirmHintStyle = css({
  fontSize: "[13px]",
  color: "neutral.s80",
});

const aiMenuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const DiffEqMainContent: React.FC = () => {
  const { differentialEquation, types, places, updateDifferentialEquation } =
    useDiffEqPropertiesContext();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingTypeId, setPendingTypeId] = useState<string | null>(null);
  const isReadOnly = useIsReadOnly();

  const placesUsingEquation = places.filter((place) => {
    if (!place.differentialEquationId) {
      return false;
    }
    if (typeof place.differentialEquationId === "object") {
      return place.differentialEquationId === differentialEquation.id;
    }
    return false;
  });

  const handleTypeChange = (newTypeId: string) => {
    if (placesUsingEquation.length > 0) {
      setPendingTypeId(newTypeId);
      setShowConfirmDialog(true);
    } else {
      updateDifferentialEquation({
        equationId: differentialEquation.id,
        update: { colorId: newTypeId },
      });
    }
  };

  const confirmTypeChange = () => {
    if (pendingTypeId !== null) {
      updateDifferentialEquation({
        equationId: differentialEquation.id,
        update: { colorId: pendingTypeId },
      });
    }
    setShowConfirmDialog(false);
    setPendingTypeId(null);
  };

  const cancelTypeChange = () => {
    setShowConfirmDialog(false);
    setPendingTypeId(null);
  };

  return (
    <SectionList>
      <Section title="Name">
        <DraftFieldInput
          sourceId={differentialEquation.id}
          sourceValue={differentialEquation.name}
          validate={validateDisplayName}
          onCommit={(name) =>
            updateDifferentialEquation({
              equationId: differentialEquation.id,
              update: { name },
            })
          }
          disabled={isReadOnly}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </Section>

      <Section title="Associated Type">
        <Select
          value={differentialEquation.colorId ?? undefined}
          onValueChange={handleTypeChange}
          options={types.map((type) => ({
            value: type.id,
            label: type.name,
          }))}
          placeholder="Select a type"
          size="sm"
          disabled={isReadOnly}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
          renderTrigger={({ selectedOption }) => {
            const type = selectedOption
              ? types.find((tp) => tp.id === selectedOption.value)
              : undefined;
            if (!type) {
              return null;
            }
            return (
              <>
                <div
                  className={colorDotStyle}
                  style={{ backgroundColor: type.displayColor }}
                />
                <span>{type.name}</span>
              </>
            );
          }}
          renderItem={(option) => {
            const type = types.find((tp) => tp.id === option.value);
            return (
              <>
                <div
                  className={colorDotStyle}
                  style={{ backgroundColor: type?.displayColor }}
                />
                {option.label}
              </>
            );
          }}
        />
      </Section>

      {showConfirmDialog && (
        <Dialog size="xs" onClose={cancelTypeChange}>
          <Dialog.Header title="Change Associated Type?" />
          <Dialog.Body>
            <div className={confirmTextStyle}>
              {placesUsingEquation.length === 1 ? (
                <>
                  <strong>1 place</strong> is currently using this differential
                  equation:
                </>
              ) : (
                <>
                  <strong>{placesUsingEquation.length} places</strong> are
                  currently using this differential equation:
                </>
              )}
            </div>
            <ul className={confirmListStyle}>
              {placesUsingEquation.map((place) => (
                <li key={place.id}>{place.name}</li>
              ))}
            </ul>
            <div className={confirmHintStyle}>
              Changing the type may affect how these places behave. Are you sure
              you want to continue?
            </div>
          </Dialog.Body>
          <Dialog.Footer
            actions={
              <>
                <Button
                  variant="subtle"
                  tone="neutral"
                  size="sm"
                  onClick={cancelTypeChange}
                >
                  Cancel
                </Button>
                <Button
                  variant="solid"
                  tone="brand"
                  size="sm"
                  onClick={confirmTypeChange}
                >
                  Change Type
                </Button>
              </>
            }
          />
        </Dialog>
      )}

      <Section title="Code" fillHeight>
        <CodeEditor
          path={getDocumentUri(
            "differential-equation",
            differentialEquation.id,
          )}
          language="typescript"
          value={differentialEquation.code}
          height="100%"
          onChange={(newCode) => {
            updateDifferentialEquation({
              equationId: differentialEquation.id,
              update: { code: newCode ?? "" },
            });
          }}
          options={{ readOnly: isReadOnly }}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </Section>
    </SectionList>
  );
};

const DiffEqCodeAction: React.FC = () => {
  const { differentialEquation, types, updateDifferentialEquation } =
    useDiffEqPropertiesContext();
  const isReadOnly = useIsReadOnly();

  if (isReadOnly) {
    return null;
  }

  return (
    <Menu
      trigger={
        <Button
          aria-label="More options"
          tooltip="More options"
          variant="ghost"
          size="xs"
          iconName="ellipsisVertical"
        />
      }
      items={[
        {
          id: "load-default",
          text: "Load default template",
          onClick: () => {
            const equationType = types.find(
              (tp) => tp.id === differentialEquation.colorId,
            );

            updateDifferentialEquation({
              equationId: differentialEquation.id,
              update: {
                code: equationType
                  ? generateDefaultDifferentialEquationCode(equationType)
                  : DEFAULT_DIFFERENTIAL_EQUATION_CODE,
              },
            });
          },
        },
        {
          id: "generate-ai",
          text: (
            <Tooltip
              content={UI_MESSAGES.AI_FEATURE_COMING_SOON}
              position="bottom"
            >
              <div className={aiMenuItemStyle}>
                <Icon name="sparkles" size="sm" />
                Generate with AI
              </div>
            </Tooltip>
          ),
          disabled: true,
          onClick: () => {
            // TODO: Implement AI generation
          },
        },
      ]}
    />
  );
};

export const diffEqMainContentSubView: SubView = {
  id: "diff-eq-main-content",
  title: "Differential Equation",
  icon: DifferentialEquationIcon,
  main: true,
  component: DiffEqMainContent,
  renderHeaderAction: () => <DiffEqCodeAction />,
  alwaysShowHeaderAction: true,
};
