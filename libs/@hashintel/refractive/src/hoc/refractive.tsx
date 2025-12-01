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

function createRefractiveComponent<
  P extends { children?: React.ReactNode; style?: React.CSSProperties },
>(Component: ComponentType<P>): ComponentType<P & RefractionProps> {
  return function RefractiveWrapper(props: P & RefractionProps) {
    const { refraction, ...componentProps } = props;
    const filterId = useId();
    const elementRef = useRef<HTMLElement>(null);
    const [width, setWidth] = useState(0);
    const [height, setHeight] = useState(0);

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
    }, []);

    return (
      <>
        <Filter
          id={filterId}
          scaleRatio={1} // Always 1 for now, could be animatable in the future
          pixelRatio={6} // Always 4 for now, could be configurable in the future
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

const CACHE = new Map<string, ComponentType<any>>();

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
