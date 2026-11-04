import { lazy, Suspense, useState } from "react";

import {
  Button,
  Dialog,
  Form,
  Icon,
  Menu,
  Select,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  DEFAULT_DIFFERENTIAL_EQUATION_CODE,
  generateDefaultDifferentialEquationCode,
  placeUsesDifferentialEquation,
  validateDisplayName,
} from "@hashintel/petrinaut-core";

import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { DraftFieldInput } from "../../../../../../components/draft-field-input";
import { PropertyValue } from "../../../../../../components/property-value";
import { DifferentialEquationIcon } from "../../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { usePetrinautPresentation } from "../../../../../shared/presentation-context";
import { describeEquationForm } from "../../place-properties/subviews/place-dynamics/compose-dynamics";
import { useDiffEqPropertiesContext } from "../context";

import type { SubView } from "../../../../../../components/sub-view/types";
import type { Color } from "@hashintel/petrinaut-core";

// the section fills the panel; the last row (Code) takes the remaining height
const fieldsSectionStyle = css({
  paddingTop: "3",
  flex: "[1]",
  minHeight: "[0]",
  gridTemplateRows: "[auto auto auto minmax(0, 1fr)]",
});

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

const arcStyle = css({
  display: "flex",
  gap: "2",
  alignItems: "center",
});

/** Arities the select offers; a file may carry a larger one, listed then. */
const OFFERED_ARITIES = [1, 2, 3, 4];

const arityItems = (arity: number) =>
  [...OFFERED_ARITIES, ...(OFFERED_ARITIES.includes(arity) ? [] : [arity])]
    .toSorted((left, right) => left - right)
    .map((candidate) => ({
      value: String(candidate),
      text: describeEquationForm({ arity: candidate }),
    }));

/** Whether the code is still a template nobody has edited. */
const isTemplateCode = (
  code: string,
  type: Color | undefined,
  arity: number,
): boolean =>
  code.trim() === "" ||
  code === DEFAULT_DIFFERENTIAL_EQUATION_CODE ||
  (type !== undefined &&
    code === generateDefaultDifferentialEquationCode(type, arity));

const DeferredDifferentialEquationCodeField = lazy(async () => {
  const { DifferentialEquationCodeField } = await import("./code-field");
  return { default: DifferentialEquationCodeField };
});

const DiffEqMainContent: React.FC = () => {
  const { differentialEquation, types, places, updateDifferentialEquation } =
    useDiffEqPropertiesContext();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingTypeId, setPendingTypeId] = useState<string | null>(null);
  const isReadOnly = useIsReadOnly();
  const presentation = usePetrinautPresentation();

  const placesUsingEquation = places.filter((place) =>
    placeUsesDifferentialEquation(place, differentialEquation.id),
  );
  const equationType = types.find(
    (candidate) => candidate.id === differentialEquation.colorId,
  );

  /**
   * Changing how the equation sees tokens changes its code's shape, so an
   * untouched template is swapped for the new form's template; edited code
   * is kept for the author to adapt.
   */
  const handleArityChange = (value: string) => {
    const arity = Number(value);
    const code =
      equationType !== undefined &&
      isTemplateCode(
        differentialEquation.code,
        equationType,
        differentialEquation.arity,
      )
        ? generateDefaultDifferentialEquationCode(equationType, arity)
        : differentialEquation.code;
    updateDifferentialEquation({
      equationId: differentialEquation.id,
      update: { arity, code },
    });
  };

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
    <>
      <Form.Section className={fieldsSectionStyle}>
        <DraftFieldInput
          label="Name"
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

        <Form.Field label="Associated Type" size="sm">
          <PropertyValue
            text={
              types.find(
                (candidate) => candidate.id === differentialEquation.colorId,
              )?.name
            }
          >
            <Tooltip
              content={UI_MESSAGES.READ_ONLY_MODE}
              disableTooltip={!isReadOnly}
            >
              <Select
                required
                value={differentialEquation.colorId ?? ""}
                onChange={(colorId) => {
                  if (colorId) {
                    handleTypeChange(colorId);
                  }
                }}
                items={types.map((type) => ({
                  value: type.id,
                  text: type.name,
                }))}
                placeholder="Select a type"
                size="sm"
                disabled={isReadOnly}
                renderItem={(value) => {
                  const type = types.find((tp) => tp.id === value);
                  return (
                    <div className={arcStyle}>
                      <div
                        className={colorDotStyle}
                        style={{ backgroundColor: type?.displayColor }}
                      />
                      {type?.name ?? value}
                    </div>
                  );
                }}
              />
            </Tooltip>
          </PropertyValue>
        </Form.Field>

        <Form.Field label="Tokens" size="sm">
          <PropertyValue text={describeEquationForm(differentialEquation)}>
            <Tooltip
              content={UI_MESSAGES.READ_ONLY_MODE}
              disableTooltip={!isReadOnly}
            >
              <Select
                aria-label="Tokens"
                required
                value={String(differentialEquation.arity)}
                onChange={handleArityChange}
                items={arityItems(differentialEquation.arity)}
                size="sm"
                disabled={isReadOnly}
              />
            </Tooltip>
          </PropertyValue>
        </Form.Field>

        {presentation.showSourceCode && (
          <Suspense fallback={null}>
            <DeferredDifferentialEquationCodeField />
          </Suspense>
        )}
      </Form.Section>

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
    </>
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
                  ? generateDefaultDifferentialEquationCode(
                      equationType,
                      differentialEquation.arity,
                    )
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
  fullWidthCodeEditor: true,
  title: "Differential Equation",
  icon: DifferentialEquationIcon,
  main: true,
  component: DiffEqMainContent,
  renderHeaderAction: () => <DiffEqCodeAction />,
  headerActionMutates: true,
  alwaysShowHeaderAction: true,
};
