import { RefractivePane } from "@hashintel/ds-components/refractive-pane";
import { css } from "@hashintel/ds-helpers/css";

/**
 * PropertiesPanel displays properties and controls for the selected node/edge.
 * Currently shows a placeholder while being developed.
 */
export const PropertiesPanel: React.FC = () => {
  return (
    <div
      style={{
        display: "flex",
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        padding: "24px",
        height: "calc(100% - 48px)",
        zIndex: 1000,
      }}
    >
      <RefractivePane
        radius={16}
        blur={7}
        specularOpacity={0.2}
        scaleRatio={1}
        bezelWidth={65}
        glassThickness={120}
        refractiveIndex={1.5}
        className={css({
          height: "[100%]",
          width: "[320px]",
          backgroundColor: "[rgba(255, 255, 255, 0.7)]",
          boxShadow: "0 4px 30px rgba(0, 0, 0, 0.15)",
          border: "1px solid rgba(255, 255, 255, 0.8)",
        })}
        style={{
          borderRadius: 16,
          padding: 8,
        }}
      >
        Hello
      </RefractivePane>
    </div>
  );
};
