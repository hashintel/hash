import type { ComponentType } from "react";
import { createElement, useId, useRef } from "react";
import type { JSX } from "react/jsx-runtime";

import type { CompositeMode } from "../components/filter-shell";
import { FilterShell } from "../components/filter-shell";
import { generateMagnitudeTable } from "../helpers/generate-table-values";
import { splitImageDataToParts } from "../helpers/split-imagedata-to-parts";
import { convex } from "../helpers/surface-equations";
import { calculateDisplacementMapRadius } from "../maps/displacement-radius";
import { calculatePolarDistanceToBorderMap } from "../maps/polar-distance-to-border-map";

/**
 * Reference radius used to generate the hi-res polar field.
 * The image is (REFERENCE_RADIUS * 2 + 1) = 513 pixels per side.
 * This is computed once and reused for any actual radius.
 */
const REFERENCE_RADIUS = 256;

/**
 * Pre-computed hi-res geometric polar field at 513×513 pixels.
 * Since the map encodes normalized values (border distance ratio + angle),
 * the same image works for any actual radius.
 */
const hiResPolarMap = calculatePolarDistanceToBorderMap(REFERENCE_RADIUS);

/**
 * Pre-split 9-patch parts from the hi-res polar map.
 * These are sliced at the reference resolution (256px corners)
 * and can be positioned at any target radius in the SVG.
 */
const hiResParts = splitImageDataToParts({
  imageData: hiResPolarMap,
  cornerWidth: REFERENCE_RADIUS,
  pixelRatio: 1,
});

type RefractionProps = {
  refraction: {
    radius: number;
    blur?: number;
    thickness?: number;
    edgeSize?: number;
    refractiveIndex?: number;
    edgeProfile?: (x: number) => number;
    /**
     * Compositing strategy for the polar map:
     * - `"image"` (default): Single composite SVG, auto-sizes via objectBoundingBox.
     * - `"parts"`: 9-patch feImage primitives, requires explicit sizing.
     */
    compositing?: CompositeMode;
  };
};

/**
 * @private
 * Higher-order component (HOC) that wraps a given component to apply a refractive glass effect.
 *
 * Exposed in `refractive` proxy, which also exposes JSXIntrinsicElements as keys.
 */
function createRefractiveComponent<
  P extends {
    children?: React.ReactElement;
    style?: React.CSSProperties;
    ref?: React.RefObject<HTMLElement>;
  },
>(Component: ComponentType<P>): ComponentType<P & RefractionProps> {
  return (props: P & RefractionProps) => {
    const {
      refraction,
      ref: externalRef,
      ...componentProps
    } = props as P & RefractionProps & { ref?: React.Ref<HTMLElement> };
    const filterId = useId();
    const internalRef = useRef<HTMLElement>(null);

    const elementRef = externalRef ?? internalRef;

    const edgeSize = refraction.edgeSize ?? 0;
    const radius = refraction.radius;
    const clampedEdgeSize = Math.min(edgeSize, radius);

    const displacementRadius = calculateDisplacementMapRadius(
      refraction.thickness ?? 70,
      clampedEdgeSize,
      refraction.edgeProfile ?? convex,
      refraction.refractiveIndex ?? 1.5,
    );

    const maximumDisplacement = Math.max(...displacementRadius.map(Math.abs));
    const ratioScale = clampedEdgeSize > 0 ? radius / clampedEdgeSize : 1;
    const magnitudeTable = generateMagnitudeTable(
      displacementRadius,
      maximumDisplacement,
      ratioScale,
    );

    return (
      <>
        <FilterShell
          id={filterId}
          blur={refraction.blur ?? 0}
          scale={2 * maximumDisplacement}
          magnitudeTable={magnitudeTable}
          parts={hiResParts}
          cornerWidth={radius}
          compositing={refraction.compositing}
          elementRef={elementRef}
        />

        {/* @ts-expect-error Need to fix types in this file */}
        <Component
          {...componentProps}
          ref={elementRef}
          style={{
            ...componentProps.style,
            backdropFilter: `url(#${filterId})`,
            borderRadius: refraction.radius,
          }}
        />
      </>
    );
  };
}

type HTMLElements = {
  [K in keyof JSX.IntrinsicElements]: ComponentType<
    JSX.IntrinsicElements[K] & RefractionProps
  >;
};

type RefractiveFunction = (<P extends object>(
  Component: ComponentType<P>,
) => ComponentType<P & RefractionProps>) &
  HTMLElements;

/**
 * Cache for JSX intrinsic elements refractive components, created on demand.
 */
const CACHE = new Map<string, ComponentType<any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Refractive is a higher-order component (HOC) that can wrap any HTML element or custom React component
 * to apply a refractive glass effect using SVG filters.
 *
 * The wrapped component must accept a `ref` prop to reference the underlying DOM element.
 *
 * Refractive will override:
 * - `borderRadius` based on the provided `radius` in the `refraction` prop.
 * - `backdropFilter` to apply the SVG filter for the refractive effect.
 *
 * Usage with HTML elements:
 *
 * ```tsx
 * <refractive.div
 *   refraction={{ radius: 8, blur: 2 }}
 *   style={{ width: 200, height: 100, backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
 * />
 * ```
 *
 * Usage with existing components:
 *
 * ```tsx
 * import { refractive } from "@hashintel/refractive";
 *
 * const MyRefractiveButton = refractive(MyButton);
 *
 * <MyRefractiveButton
 *   refraction={{ radius: 8, blur: 2 }}
 *   style={{ width: 200, height: 100, backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
 * />
 * ```
 *
 * @param Component - The React component or HTML element to wrap.
 * @returns Same component with refraction props.
 */
export const refractive = new Proxy(createRefractiveComponent, {
  get: (_target, elementName: keyof JSX.IntrinsicElements) => {
    if (CACHE.has(elementName)) {
      return CACHE.get(elementName);
    }
    const refractiveComponent = createRefractiveComponent(
      ({ children, ...props }) => createElement(elementName, props, children),
    );
    CACHE.set(elementName, refractiveComponent);
    return refractiveComponent;
  },
  apply: (target, _thisArg, argArray: Parameters<RefractiveFunction>) => {
    return target(...argArray);
  },
}) as RefractiveFunction;
