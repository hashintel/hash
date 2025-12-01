import type { ComponentType } from "react";
import { createElement, useEffect, useId, useRef, useState } from "react";
import type { JSX } from "react/jsx-runtime";
import { Filter } from "../components/filter";
import { CONVEX } from "../helpers/surface-equations";

type RefractionProps = {
  refraction: {
    radius: number;
    blur?: number;
    glassThickness?: number;
    bezelWidth?: number;
    refractiveIndex?: number;
    specularOpacity?: number;
    specularAngle?: number;
    bezelHeightFn?: (x: number) => number;
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
  return function RefractiveWrapper(props: P & RefractionProps) {
    const {
      refraction,
      ref: externalRef,
      ...componentProps
    } = props as P & RefractionProps & { ref?: React.Ref<HTMLElement> };
    const filterId = useId();
    const internalRef = useRef<HTMLElement>(null);
    const [width, setWidth] = useState(0);
    const [height, setHeight] = useState(0);

    // If a ref is passed in props, use it; otherwise, use internalRef.
    // If the passed ref is updated later, it will trigger a re-render.
    const elementRef = props.ref ?? internalRef;

    useEffect(() => {
      const element = elementRef.current;
      if (!element) return;

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const borderBox = entry.borderBoxSize[0];

          if (borderBox) {
            setWidth(borderBox.inlineSize);
            setHeight(borderBox.blockSize);
          } else {
            setWidth(entry.contentRect.width);
            setHeight(entry.contentRect.height);
          }
        }
      });

      resizeObserver.observe(element);

      return () => {
        resizeObserver.disconnect();
      };
    }, [elementRef]);

    return (
      <>
        <Filter
          id={filterId}
          scaleRatio={1} // Always 1 for now, could be animatable in the future
          pixelRatio={6} // Always 6 for now, could be configurable in the future
          width={width}
          height={height}
          blur={refraction.blur ?? 0}
          radius={refraction.radius ?? 4}
          glassThickness={refraction.glassThickness ?? 70}
          bezelWidth={refraction.bezelWidth ?? 0}
          refractiveIndex={refraction.refractiveIndex ?? 1.5}
          specularOpacity={refraction.specularOpacity ?? 0}
          specularAngle={refraction.specularAngle ?? 0}
          bezelHeightFn={refraction.bezelHeightFn ?? CONVEX}
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
const CACHE = new Map<string, ComponentType<any>>();

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
export const refractive = new Proxy(createRefractiveComponent as any, {
  get: (_target, elementName: keyof JSX.IntrinsicElements) => {
    if (CACHE.has(elementName)) {
      return CACHE.get(elementName);
    }
    const refractiveComponent = createRefractiveComponent(
      ({ children, ...props }: any) =>
        createElement(elementName, props, children),
    );
    CACHE.set(elementName, refractiveComponent);
    return refractiveComponent;
  },
  apply: (target, _thisArg, argArray) => {
    return target(...argArray);
  },
}) as RefractiveFunction;
