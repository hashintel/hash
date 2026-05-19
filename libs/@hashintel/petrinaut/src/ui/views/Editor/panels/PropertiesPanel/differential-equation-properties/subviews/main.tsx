import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { useEffect, useState } from "react";

import { Button } from "../../../../../../components/button";
import { Input } from "../../../../../../components/input";
import { Menu } from "../../../../../../components/menu";
import { Section, SectionList } from "../../../../../../components/section";
import { Select } from "../../../../../../components/select";
import type { SubView } from "../../../../../../components/sub-view/types";
import { Tooltip } from "../../../../../../components/tooltip";
import { DifferentialEquationIcon } from "../../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import {
  DEFAULT_DIFFERENTIAL_EQUATION_CODE,
  generateDefaultDifferentialEquationCode,
  validateDisplayName,
} from "@hashintel/petrinaut-core";
import { CodeEditor } from "../../../../../../monaco/code-editor";
import { getDocumentUri } from "../../../../../../monaco/editor-paths";
import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { useDiffEqPropertiesContext } from "../context";

const colorDotStyle = css({
  width: "[12px]",
  height: "[12px]",
  borderRadius: "[50%]",
  flexShrink: 0,
});

const confirmDialogOverlayStyle = css({
  position: "absolute",
  top: "[0]",
  left: "[0]",
  right: "[0]",
  bottom: "[0]",
  backgroundColor: "[rgba(0, 0, 0, 0.5)]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10000,
});

const confirmDialogStyle = css({
  backgroundColor: "neutral.s00",
  borderRadius: "lg",
  padding: "[24px]",
  maxWidth: "[400px]",
  boxShadow: "[0 4px 16px rgba(0, 0, 0, 0.2)]",
});

const confirmDialogTitleStyle = css({
  fontWeight: "semibold",
  fontSize: "base",
  marginBottom: "[12px]",
});

const confirmDialogTextStyle = css({
  fontSize: "sm",
  color: "[#666]",
  marginBottom: "[16px]",
});

const confirmDialogListStyle = css({
  fontSize: "[13px]",
  color: "[#666]",
  marginBottom: "[16px]",
  paddingLeft: "[20px]",
});

const confirmDialogHintStyle = css({
  fontSize: "[13px]",
  color: "[#999]",
  marginBottom: "[20px]",
});

const confirmDialogButtonsStyle = css({
  display: "flex",
  gap: "[8px]",
  justifyContent: "flex-end",
});

const aiMenuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const errorMessageStyle = css({
  fontSize: "xs",
  color: "red.s100",
});

const DiffEqMainContent: React.FC = () => {
  const { differentialEquation, types, places, updateDifferentialEquation } =
    useDiffEqPropertiesContext();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingTypeId, setPendingTypeId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState(differentialEquation.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const isReadOnly = useIsReadOnly();

  useEffect(() => {
    setNameInput(differentialEquation.name);
    setNameError(null);
  }, [differentialEquation.id, differentialEquation.name]);

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
        <Input
          value={nameInput}
          onChange={(event) => {
            setNameInput(event.target.value);
            if (nameError) {
              setNameError(null);
            }
          }}
          onBlur={() => {
            const result = validateDisplayName(nameInput);

            if (!result.valid) {
              setNameError(result.error);
              return;
            }

            setNameError(null);
            if (result.name !== differentialEquation.name) {
              updateDifferentialEquation({
                equationId: differentialEquation.id,
                update: { name: result.name },
              });
            }
          }}
          disabled={isReadOnly}
          hasError={!!nameError}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
        {nameError && <div className={errorMessageStyle}>{nameError}</div>}
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

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div className={confirmDialogOverlayStyle} onClick={cancelTypeChange}>
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            className={confirmDialogStyle}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className={confirmDialogTitleStyle}>
              Change Associated Type?
            </div>
            <div className={confirmDialogTextStyle}>
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
            <ul className={confirmDialogListStyle}>
              {placesUsingEquation.map((place) => (
                <li key={place.id}>{place.name}</li>
              ))}
            </ul>
            <div className={confirmDialogHintStyle}>
              Changing the type may affect how these places behave. Are you sure
              you want to continue?
            </div>
            <div className={confirmDialogButtonsStyle}>
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
            </div>
          </div>
        </div>
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
      animated
      trigger={
        <Button
          aria-label="More options"
          tooltip="More options"
          tooltipDisplay="inline"
          variant="ghost"
          size="xs"
          iconName="ellipsisVertical"
        />
      }
      items={[
        {
          id: "load-default",
          label: "Load default template",
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
          label: (
            <Tooltip
              content={UI_MESSAGES.AI_FEATURE_COMING_SOON}
              display="inline"
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
