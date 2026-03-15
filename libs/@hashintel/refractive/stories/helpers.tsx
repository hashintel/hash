import { useId } from "react";

import type { SurfaceFnDef } from "../src/helpers/surface-equations";
import { CONVEX } from "../src/helpers/surface-equations";

export type SharedFilterProps = {
  blur: number;
  radius: number;
  glassThickness: number;
  bezelWidth: number;
  refractiveIndex: number;
  specularOpacity: number;
  specularAngle: number;
  bezelHeightFn: SurfaceFnDef;
};

export const defaultFilterArgs: SharedFilterProps = {
  blur: 2,
  radius: 20,
  glassThickness: 70,
  bezelWidth: 30,
  refractiveIndex: 1.5,
  specularOpacity: 0.9,
  specularAngle: 2,
  bezelHeightFn: CONVEX,
};

export const filterArgTypes = {
  blur: { control: { type: "range" as const, min: 0, max: 20, step: 0.5 } },
  radius: { control: { type: "range" as const, min: 0, max: 100, step: 1 } },
  glassThickness: {
    control: { type: "range" as const, min: 0, max: 300, step: 1 },
  },
  bezelWidth: {
    control: { type: "range" as const, min: 0, max: 100, step: 1 },
  },
  refractiveIndex: {
    control: { type: "range" as const, min: 1, max: 3, step: 0.01 },
  },
  specularOpacity: {
    control: { type: "range" as const, min: 0, max: 1, step: 0.01 },
  },
  specularAngle: {
    control: { type: "range" as const, min: 0, max: 6.28, step: 0.01 },
  },
  bezelHeightFn: { table: { disable: true } },
};

/**
 * Wrapper that renders a filter + a div with that filter applied, over a colorful background.
 */
export const FilterShowcase: React.FC<{
  children: (id: string) => React.ReactNode;
}> = ({ children }) => {
  const filterId = useId();

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        background:
          "repeating-conic-gradient(#e66465 0% 25%, #9198e5 0% 50%) 0 / 40px 40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children(filterId)}

      <div
        style={{
          width: 400,
          height: 300,
          backdropFilter: `url(#${filterId})`,
          borderRadius: 20,
          backgroundColor: "rgba(255, 255, 255, 0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          fontWeight: 600,
          color: "#333",
        }}
      >
        Refractive Glass
      </div>
    </div>
  );
};
