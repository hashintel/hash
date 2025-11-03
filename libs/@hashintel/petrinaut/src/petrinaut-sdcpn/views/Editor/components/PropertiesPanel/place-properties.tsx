import MonacoEditor from "@monaco-editor/react";

import type { Place, SDCPNType } from "../../../../../core/types/sdcpn";
import { Switch } from "../../../../components/switch";
import { InitialStateEditor } from "./initial-state-editor";

interface PlacePropertiesProps {
  place: Place;
  types: SDCPNType[];
  globalMode: "edit" | "simulate";
  onUpdate: (id: string, updates: Partial<Place>) => void;
}

export const PlaceProperties: React.FC<PlacePropertiesProps> = ({
  place,
  types,
  globalMode,
  onUpdate,
}) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
          Place
        </div>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>
          {place.id}
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Name
        </div>
        <input
          type="text"
          value={place.name}
          onChange={(event) => {
            onUpdate(place.id, {
              name: event.target.value,
            });
          }}
          style={{
            fontSize: 14,
            padding: "6px 8px",
            border: "1px solid rgba(0, 0, 0, 0.1)",
            borderRadius: 4,
            width: "100%",
            boxSizing: "border-box",
          }}
        />
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Type
        </div>
        <select
          value={place.type ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            onUpdate(place.id, {
              type: value === "" ? null : value,
            });
          }}
          style={{
            fontSize: 14,
            padding: "6px 8px",
            border: "1px solid rgba(0, 0, 0, 0.1)",
            borderRadius: 4,
            width: "100%",
            boxSizing: "border-box",
            backgroundColor: "white",
          }}
        >
          <option value="">None</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </div>

      {/* Initial State section - only in Simulate mode */}
      {globalMode === "simulate" &&
        (() => {
          const placeType = place.type
            ? types.find((tp) => tp.id === place.type)
            : null;

          // If no type or type has 0 dimensions, show simple number input
          if (!placeType || placeType.elements.length === 0) {
            return (
              <div>
                <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
                  Initial State
                </div>
                <div>
                  <div
                    style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}
                  >
                    Token count
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    defaultValue="0"
                    style={{
                      fontSize: 14,
                      padding: "6px 8px",
                      border: "1px solid rgba(0, 0, 0, 0.1)",
                      borderRadius: 4,
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
            );
          }

          return <InitialStateEditor key={place.id} placeType={placeType} />;
        })()}

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Position
        </div>
        <div style={{ fontSize: 14 }}>
          x: {place.x.toFixed(0)}, y: {place.y.toFixed(0)}
        </div>
      </div>

      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div style={{ fontWeight: 500, fontSize: 12 }}>Dynamics</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <Switch
              checked={place.dynamicsEnabled}
              onCheckedChange={(checked) => {
                onUpdate(place.id, {
                  dynamicsEnabled: checked,
                });
              }}
            />
          </div>
        </div>
      </div>

      {place.dynamicsEnabled && (
        <div>
          <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
            Differential Equation Code
          </div>
          <div
            style={{
              border: "1px solid rgba(0, 0, 0, 0.1)",
              borderRadius: 4,
              overflow: "hidden",
              height: 200,
            }}
          >
            <MonacoEditor
              height="200px"
              defaultLanguage="python"
              value={
                typeof place.differentialEquationCode === "string"
                  ? place.differentialEquationCode
                  : ""
              }
              onChange={(value) => {
                onUpdate(place.id, {
                  differentialEquationCode: value ?? "",
                });
              }}
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
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
