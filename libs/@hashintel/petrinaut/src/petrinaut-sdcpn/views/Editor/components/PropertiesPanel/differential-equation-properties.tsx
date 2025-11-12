/* eslint-disable id-length */

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
  DifferentialEquation,
  Place,
  SDCPNType,
} from "../../../../core/types/sdcpn";

interface DifferentialEquationPropertiesProps {
  differentialEquation: DifferentialEquation;
  types: SDCPNType[];
  places: Place[];
  globalMode: "edit" | "simulate";
  onUpdate: (
    equationId: string,
    updates: Partial<DifferentialEquation>,
  ) => void;
}

export const DifferentialEquationProperties: React.FC<
  DifferentialEquationPropertiesProps
> = ({ differentialEquation, types, places, globalMode, onUpdate }) => {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingTypeId, setPendingTypeId] = useState<string | null>(null);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  const associatedType = types.find(
    (type) => type.id === differentialEquation.typeId,
  );

  // Find places that use this differential equation
  const placesUsingEquation = places.filter((place) => {
    if (!place.differentialEquationCode) {
      return false;
    }
    if (typeof place.differentialEquationCode === "object") {
      return (
        "refId" in place.differentialEquationCode &&
        place.differentialEquationCode.refId === differentialEquation.id
      );
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
      onUpdate(differentialEquation.id, { typeId: newTypeId });
    }
  };

  const confirmTypeChange = () => {
    if (pendingTypeId !== null) {
      onUpdate(differentialEquation.id, { typeId: pendingTypeId });
    }
    setShowConfirmDialog(false);
    setPendingTypeId(null);
  };

  const cancelTypeChange = () => {
    setShowConfirmDialog(false);
    setPendingTypeId(null);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
          Differential Equation
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Name
        </div>
        <input
          type="text"
          value={differentialEquation.name}
          onChange={(event) => {
            onUpdate(differentialEquation.id, {
              name: event.target.value,
            });
          }}
          disabled={globalMode === "simulate"}
          style={{
            fontSize: 14,
            padding: "6px 8px",
            border: "1px solid rgba(0, 0, 0, 0.1)",
            borderRadius: 4,
            width: "100%",
            boxSizing: "border-box",
            backgroundColor:
              globalMode === "simulate" ? "rgba(0, 0, 0, 0.05)" : "white",
            cursor: globalMode === "simulate" ? "not-allowed" : "text",
          }}
        />
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Associated Type
        </div>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setShowTypeDropdown(!showTypeDropdown)}
            onBlur={() => setTimeout(() => setShowTypeDropdown(false), 200)}
            disabled={globalMode === "simulate"}
            style={{
              width: "100%",
              fontSize: 14,
              padding: "6px 8px",
              border: "1px solid rgba(0, 0, 0, 0.1)",
              borderRadius: 4,
              backgroundColor:
                globalMode === "simulate" ? "rgba(0, 0, 0, 0.05)" : "white",
              cursor: globalMode === "simulate" ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              textAlign: "left",
            }}
          >
            {associatedType && (
              <>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    backgroundColor: associatedType.colorCode,
                    flexShrink: 0,
                  }}
                />
                <span>{associatedType.name}</span>
              </>
            )}
          </button>
          {showTypeDropdown && globalMode === "edit" && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: 4,
                backgroundColor: "white",
                border: "1px solid rgba(0, 0, 0, 0.1)",
                borderRadius: 4,
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
                maxHeight: 300,
                overflowY: "auto",
                zIndex: 1000,
              }}
            >
              {types.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => {
                    handleTypeChange(type.id);
                    setShowTypeDropdown(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "none",
                    backgroundColor:
                      type.id === differentialEquation.typeId
                        ? "rgba(0, 0, 0, 0.05)"
                        : "transparent",

                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 14,
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(0, 0, 0, 0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      type.id === differentialEquation.typeId
                        ? "rgba(0, 0, 0, 0.05)"
                        : "transparent";
                  }}
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      backgroundColor: type.colorCode,
                      flexShrink: 0,
                    }}
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
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
          onClick={cancelTypeChange}
        >
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            style={{
              backgroundColor: "white",
              borderRadius: 8,
              padding: 24,
              maxWidth: 400,
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>
              Change Associated Type?
            </div>
            <div style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>
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
            <ul
              style={{
                fontSize: 13,
                color: "#666",
                marginBottom: 16,
                paddingLeft: 20,
              }}
            >
              {placesUsingEquation.map((place) => (
                <li key={place.id}>{place.name}</li>
              ))}
            </ul>
            <div style={{ fontSize: 13, color: "#999", marginBottom: 20 }}>
              Changing the type may affect how these places behave. Are you sure
              you want to continue?
            </div>
            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                type="button"
                onClick={cancelTypeChange}
                style={{
                  padding: "8px 16px",
                  border: "1px solid rgba(0, 0, 0, 0.1)",
                  borderRadius: 4,
                  backgroundColor: "white",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmTypeChange}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  borderRadius: 4,
                  backgroundColor: "#2563eb",
                  color: "white",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Change Type
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div style={{ fontWeight: 500, fontSize: 12 }}>Code</div>
          {globalMode === "edit" && (
            <Menu
              trigger={
                <button
                  type="button"
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 4,
                    display: "flex",
                    alignItems: "center",
                    fontSize: 18,
                    color: "rgba(0, 0, 0, 0.6)",
                  }}
                >
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
                      (t) => t.id === differentialEquation.typeId,
                    );

                    onUpdate(differentialEquation.id, {
                      code: equationType
                        ? generateDefaultDifferentialEquationCode(equationType)
                        : DEFAULT_DIFFERENTIAL_EQUATION_CODE,
                    });
                  },
                },
                {
                  id: "generate-ai",
                  label: (
                    <Tooltip content={UI_MESSAGES.AI_FEATURE_COMING_SOON}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <TbSparkles style={{ fontSize: 16 }} />
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
        <div
          style={{
            border: "1px solid rgba(0, 0, 0, 0.1)",
            borderRadius: 4,
            overflow: "hidden",
            flex: 1,
            minHeight: 0,
          }}
        >
          <MonacoEditor
            language="typescript"
            value={differentialEquation.code}
            onChange={(newCode) => {
              onUpdate(differentialEquation.id, {
                code: newCode ?? "",
              });
            }}
            path={`inmemory://sdcpn/differential-equations/${differentialEquation.id}.ts`}
            theme="vs-light"
            options={{
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 12,
              lineNumbers: "on",
              folding: true,
              glyphMargin: false,
              lineDecorationsWidth: 0,
              lineNumbersMinChars: 3,
              padding: { top: 8, bottom: 8 },
              fixedOverflowWidgets: true,
              readOnly: globalMode === "simulate",
            }}
          />
        </div>
      </div>
    </div>
  );
};
