/* eslint-disable id-length */

import { css, cva } from "@hashintel/ds-helpers/css";
import MonacoEditor from "@monaco-editor/react";
import { useState } from "react";
import { TbDotsVertical, TbSparkles } from "react-icons/tb";

import { Menu } from "../../../../components/menu";
import { Tooltip } from "../../../../components/tooltip";
import { UI_MESSAGES } from "../../../../constants/ui-messages";
import {
  DEFAULT_DIFFERENTIAL_EQUATION_CODE,
  generateDefaultDifferentialEquationCode,
} from "../../../../core/default-codes";
import type {
  Color,
  DifferentialEquation,
  Place,
} from "../../../../core/types/sdcpn";
import { useIsReadOnly } from "../../../../state/use-is-read-only";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  gap: "[12px]",
});

const headerTitleStyle = css({
  fontWeight: 600,
  fontSize: "[16px]",
  marginBottom: "[8px]",
});

const fieldLabelStyle = css({
  fontWeight: 500,
  fontSize: "[12px]",
  marginBottom: "[4px]",
});

const inputStyle = cva({
  base: {
    fontSize: "[14px]",
    padding: "[6px 8px]",
    border: "[1px solid rgba(0, 0, 0, 0.1)]",
    borderRadius: "[4px]",
    width: "[100%]",
    boxSizing: "border-box",
  },
  variants: {
    isReadOnly: {
      true: {
        backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        cursor: "not-allowed",
      },
      false: {
        backgroundColor: "[white]",
        cursor: "text",
      },
    },
  },
});

const typeDropdownButtonStyle = cva({
  base: {
    width: "[100%]",
    fontSize: "[14px]",
    padding: "[6px 8px]",
    border: "[1px solid rgba(0, 0, 0, 0.1)]",
    borderRadius: "[4px]",
    display: "flex",
    alignItems: "center",
    gap: "[8px]",
    textAlign: "left",
  },
  variants: {
    isReadOnly: {
      true: {
        backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        cursor: "not-allowed",
      },
      false: {
        backgroundColor: "[white]",
        cursor: "pointer",
      },
    },
  },
});

const colorDotStyle = css({
  width: "[12px]",
  height: "[12px]",
  borderRadius: "[50%]",
  flexShrink: 0,
});

const dropdownMenuStyle = css({
  position: "absolute",
  top: "[100%]",
  left: "[0]",
  right: "[0]",
  marginTop: "[4px]",
  backgroundColor: "[white]",
  border: "[1px solid rgba(0, 0, 0, 0.1)]",
  borderRadius: "[4px]",
  boxShadow: "[0 4px 16px rgba(0, 0, 0, 0.15)]",
  maxHeight: "[300px]",
  overflowY: "auto",
  zIndex: 1000,
});

const dropdownItemStyle = css({
  width: "[100%]",
  padding: "[8px 12px]",
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
  fontSize: "[14px]",
  textAlign: "left",
});

const confirmDialogOverlayStyle = css({
  position: "fixed",
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
  backgroundColor: "[white]",
  borderRadius: "[8px]",
  padding: "[24px]",
  maxWidth: "[400px]",
  boxShadow: "[0 4px 16px rgba(0, 0, 0, 0.2)]",
});

const confirmDialogTitleStyle = css({
  fontWeight: 600,
  fontSize: "[16px]",
  marginBottom: "[12px]",
});

const confirmDialogTextStyle = css({
  fontSize: "[14px]",
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

const cancelButtonStyle = css({
  padding: "[8px 16px]",
  border: "[1px solid rgba(0, 0, 0, 0.1)]",
  borderRadius: "[4px]",
  backgroundColor: "[white]",
  cursor: "pointer",
  fontSize: "[14px]",
});

const confirmButtonStyle = css({
  padding: "[8px 16px]",
  border: "none",
  borderRadius: "[4px]",
  backgroundColor: "[#2563eb]",
  color: "[white]",
  cursor: "pointer",
  fontSize: "[14px]",
});

const codeContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
});

const codeHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "[8px]",
});

const codeHeaderLabelStyle = css({
  fontWeight: 500,
  fontSize: "[12px]",
});

const menuButtonStyle = css({
  background: "[transparent]",
  border: "none",
  cursor: "pointer",
  padding: "[4px]",
  display: "flex",
  alignItems: "center",
  fontSize: "[18px]",
  color: "[rgba(0, 0, 0, 0.6)]",
});

const editorContainerStyle = cva({
  base: {
    border: "[1px solid rgba(0, 0, 0, 0.1)]",
    borderRadius: "[4px]",
    overflow: "hidden",
    flex: "[1]",
    minHeight: "[0]",
  },
  variants: {
    isReadOnly: {
      true: {
        filter: "[grayscale(20%) brightness(98%)]",
        pointerEvents: "none",
      },
      false: {
        filter: "[none]",
        pointerEvents: "auto",
      },
    },
  },
});

const aiMenuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const aiIconStyle = css({
  fontSize: "[16px]",
});

interface DifferentialEquationPropertiesProps {
  differentialEquation: DifferentialEquation;
  types: Color[];
  places: Place[];
  updateDifferentialEquation: (
    equationId: string,
    updateFn: (equation: DifferentialEquation) => void,
  ) => void;
}

export const DifferentialEquationProperties: React.FC<
  DifferentialEquationPropertiesProps
> = ({ differentialEquation, types, places, updateDifferentialEquation }) => {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingTypeId, setPendingTypeId] = useState<string | null>(null);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  const isReadOnly = useIsReadOnly();

  const associatedType = types.find(
    (type) => type.id === differentialEquation.colorId,
  );

  // Find places that use this differential equation
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
    // Check if any places are using this equation
    if (placesUsingEquation.length > 0) {
      // Show confirmation dialog
      setPendingTypeId(newTypeId);
      setShowConfirmDialog(true);
    } else {
      // No places using it, update directly
      updateDifferentialEquation(
        differentialEquation.id,
        (existingEquation) => {
          existingEquation.colorId = newTypeId;
        },
      );
    }
  };

  const confirmTypeChange = () => {
    if (pendingTypeId !== null) {
      updateDifferentialEquation(
        differentialEquation.id,
        (existingEquation) => {
          existingEquation.colorId = pendingTypeId;
        },
      );
    }
    setShowConfirmDialog(false);
    setPendingTypeId(null);
  };

  const cancelTypeChange = () => {
    setShowConfirmDialog(false);
    setPendingTypeId(null);
  };

  return (
    <div className={containerStyle}>
      <div>
        <div className={headerTitleStyle}>Differential Equation</div>
      </div>

      <div>
        <div className={fieldLabelStyle}>Name</div>
        <input
          type="text"
          value={differentialEquation.name}
          onChange={(event) => {
            updateDifferentialEquation(
              differentialEquation.id,
              (existingEquation) => {
                existingEquation.name = event.target.value;
              },
            );
          }}
          disabled={isReadOnly}
          className={inputStyle({ isReadOnly })}
        />
      </div>

      <div>
        <div className={fieldLabelStyle}>Associated Type</div>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setShowTypeDropdown(!showTypeDropdown)}
            onBlur={() => setTimeout(() => setShowTypeDropdown(false), 200)}
            disabled={isReadOnly}
            className={typeDropdownButtonStyle({ isReadOnly })}
          >
            {associatedType && (
              <>
                <div
                  className={colorDotStyle}
                  style={{ backgroundColor: associatedType.displayColor }}
                />
                <span>{associatedType.name}</span>
              </>
            )}
          </button>
          {showTypeDropdown && !isReadOnly && (
            <div className={dropdownMenuStyle}>
              {types.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => {
                    handleTypeChange(type.id);
                    setShowTypeDropdown(false);
                  }}
                  className={dropdownItemStyle}
                  style={{
                    backgroundColor:
                      type.id === differentialEquation.colorId
                        ? "rgba(0, 0, 0, 0.05)"
                        : "transparent",
                  }}
                  onMouseEnter={(event) => {
                    // eslint-disable-next-line no-param-reassign
                    event.currentTarget.style.backgroundColor =
                      "rgba(0, 0, 0, 0.05)";
                  }}
                  onMouseLeave={(event) => {
                    // eslint-disable-next-line no-param-reassign
                    event.currentTarget.style.backgroundColor =
                      type.id === differentialEquation.colorId
                        ? "rgba(0, 0, 0, 0.05)"
                        : "transparent";
                  }}
                >
                  <div
                    className={colorDotStyle}
                    style={{ backgroundColor: type.displayColor }}
                  />
                  <span>{type.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

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
              <button
                type="button"
                onClick={cancelTypeChange}
                className={cancelButtonStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmTypeChange}
                className={confirmButtonStyle}
              >
                Change Type
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={codeContainerStyle}>
        <div className={codeHeaderStyle}>
          <div className={codeHeaderLabelStyle}>Code</div>
          {!isReadOnly && (
            <Menu
              trigger={
                <button type="button" className={menuButtonStyle}>
                  <TbDotsVertical />
                </button>
              }
              items={[
                {
                  id: "load-default",
                  label: "Load default template",
                  onClick: () => {
                    // Get the associated type to generate appropriate default code
                    const equationType = types.find(
                      (t) => t.id === differentialEquation.colorId,
                    );

                    updateDifferentialEquation(
                      differentialEquation.id,
                      (existingEquation) => {
                        existingEquation.code = equationType
                          ? generateDefaultDifferentialEquationCode(
                              equationType,
                            )
                          : DEFAULT_DIFFERENTIAL_EQUATION_CODE;
                      },
                    );
                  },
                },
                {
                  id: "generate-ai",
                  label: (
                    <Tooltip content={UI_MESSAGES.AI_FEATURE_COMING_SOON}>
                      <div className={aiMenuItemStyle}>
                        <TbSparkles className={aiIconStyle} />
                        Generate with AI
                      </div>
                    </Tooltip>
                  ),
                  disabled: true,
                  onClick: () => {
                    // TODO: Implement AI generation when editing is available
                  },
                },
              ]}
            />
          )}
        </div>
        <div className={editorContainerStyle({ isReadOnly })}>
          <MonacoEditor
            language="typescript"
            value={differentialEquation.code}
            onChange={(newCode) => {
              updateDifferentialEquation(
                differentialEquation.id,
                (existingEquation) => {
                  existingEquation.code = newCode ?? "";
                },
              );
            }}
            path={`inmemory://sdcpn/differential-equations/${differentialEquation.id}.ts`}
            theme="vs-light"
            options={{
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 12,
              lineNumbers: "off",
              folding: true,
              glyphMargin: false,
              lineDecorationsWidth: 0,
              lineNumbersMinChars: 3,
              padding: { top: 8, bottom: 8 },
              fixedOverflowWidgets: true,
              readOnly: isReadOnly,
            }}
          />
        </div>
      </div>
    </div>
  );
};
