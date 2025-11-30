import type { ComponentType } from "react";
import { createElement, useEffect, useRef, useState } from "react";
import type { JSX } from "react/jsx-runtime";
import { Filter } from "../components/filter";

type RefractionProps = {
  refraction: {
    radius: number;
    blur: number;
    glassThickness: number;
    bezelWidth: number;
    refractiveIndex: number;
    specularOpacity: number;
    specularAngle: number;
    bezelHeightFn: (x: number) => number;
  };
};

function createRefractiveComponent<P extends { style: React.CSSProperties }>(
  Component: ComponentType<P> | string,
): ComponentType<P & RefractionProps> {
  return function RefractiveWrapper(props: P & RefractionProps) {
    const { refraction, ...componentProps } = props;
    const filterId = "Example";
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
          pixelRatio={2} // Always 2 for now, could be configurable in the future
          width={width}
          height={height}
          blur={refraction.blur}
          radius={refraction.radius}
          glassThickness={refraction.glassThickness}
          bezelWidth={refraction.bezelWidth}
          refractiveIndex={refraction.refractiveIndex}
          specularOpacity={refraction.specularOpacity}
          specularAngle={refraction.specularAngle}
          bezelHeightFn={refraction.bezelHeightFn}
        />

        {createElement(Component, {
          ...componentProps,
          ref: elementRef,
          style: {
            ...componentProps.style,
            backdropFilter: `url(#${filterId})`,
            borderRadius: refraction.radius,
          },
        } as P)}
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

export const refractive = new Proxy(createRefractiveComponent as any, {
  get: (_target, prop: string) => {
    return createRefractiveComponent(prop);
  },
  apply: (target, _thisArg, argArray) => {
    return target(...argArray);
  },
}) as RefractiveFunction;
