type FilterShellProps = {
  id: string;
  blur: number;
  scale: number;
  /** Use objectBoundingBox filter units (auto-sizing, no ResizeObserver). */
  obb?: boolean;
  /** Filter primitives that produce a result named "displacement_map". */
  children: React.ReactNode;
};

/**
 * @private
 * Shared SVG filter wrapper. Renders blur → children → feDisplacementMap.
 *
 * Children must render SVG filter primitives that produce a result
 * named `"displacement_map"` (the R/G encoded displacement field).
 */
export const FilterShell: React.FC<FilterShellProps> = ({
  id,
  blur,
  scale,
  obb,
  children,
}) => (
  <svg colorInterpolationFilters="sRGB" style={{ display: "none" }}>
    <defs>
      <filter
        id={id}
        {...(obb ? { x: "0", y: "0", width: "1", height: "1" } : {})}
      >
        <feGaussianBlur
          in="SourceGraphic"
          stdDeviation={blur}
          result="blurred_source"
        />

        {children}

        <feDisplacementMap
          in="blurred_source"
          in2="displacement_map"
          scale={scale}
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </defs>
  </svg>
);
