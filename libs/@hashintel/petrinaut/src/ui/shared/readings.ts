import { styleEffect, transformValue, type MotionValue } from "motion";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector";

import type { RefCallback } from "react";

/**
 * Something the UI follows without React state: a Motion value, or a function
 * computed from the Motion values it reads with `.get()`.
 *
 * A function is followed through the values it reads the first time it runs,
 * so it reads every value it depends on before any condition on one of them.
 */
export type Reading<Value> = MotionValue<Value> | (() => Value);

type IsSame<Value> = (previous: Value, next: Value) => boolean;

const isComputed = <Value>(reading: Reading<Value>): reading is () => Value =>
  typeof reading === "function";

const read = <Value>(reading: Reading<Value>): Value =>
  isComputed(reading) ? reading() : reading.get();

/**
 * Calls `listener` when a reading changes by `isSame`, until the returned
 * function runs.
 *
 * A Motion value tells its listener at once. A computed reading is worked out
 * again once per frame, however many of the values it reads have changed.
 */
export const watch = <Value>(
  reading: Reading<Value>,
  listener: (value: Value) => void,
  isSame: IsSame<Value> = Object.is,
): (() => void) => {
  const value = isComputed(reading) ? transformValue(reading) : reading;
  let last = value.get();
  const stop = value.on("change", (next) => {
    if (!isSame(last, next)) {
      last = next;
      listener(next);
    }
  });

  // A computed value listens to the values it reads until it is destroyed.
  return isComputed(reading) ? () => value.destroy() : stop;
};

const unchanged = <Value>(value: Value): Value => value;

/**
 * A reading as a value, for a component that computes with it while
 * rendering. The component renders on each change: an element that only
 * positions or sizes itself takes {@link styleRef} instead.
 */
export const useReading = <Value>(
  reading: Reading<Value>,
  isSame: IsSame<Value> = Object.is,
): Value =>
  useSyncExternalStoreWithSelector(
    (notify) => watch(reading, notify, isSame),
    () => read(reading),
    undefined,
    unchanged,
    isSame,
  );

/**
 * Style properties under the names Motion takes: `width`, `marginLeft`,
 * `--a-custom-property`. A number is in pixels where CSS takes a length.
 */
export type BoundStyle = Readonly<
  Record<
    string,
    MotionValue<number> | MotionValue<string> | (() => string | number)
  >
>;

/**
 * Keeps an element's inline style on some readings, from this call until the
 * returned function runs. Motion writes a property that changed once per
 * frame, with no component rendering.
 *
 * For values that change on every pointer move or frame, such as a size
 * during a drag. Name only properties that React's `style` prop on the same
 * element does not set.
 *
 * The write goes to the one element that depends on the value. A custom
 * property on a shared ancestor would reach every reader with one write, but
 * the browser then restyles every element below that ancestor.
 */
export const bindStyle = (
  element: HTMLElement,
  style: BoundStyle,
): (() => void) => {
  const computed: MotionValue<string | number>[] = [];
  const values: Record<string, MotionValue> = {};
  for (const [property, reading] of Object.entries(style)) {
    if (typeof reading === "function") {
      const value = transformValue(reading);
      computed.push(value);
      values[property] = value;
    } else {
      values[property] = reading;
    }
  }
  const unbind = styleEffect(element, values);
  // Motion would write on the next frame, and the element must not be
  // painted without its style.
  styleEffect.flush(element);

  return () => {
    unbind();
    for (const value of computed) {
      value.destroy();
    }
  };
};

/** {@link bindStyle} as a ref, for the element it is put on. */
export const styleRef =
  (style: BoundStyle): RefCallback<HTMLElement> =>
  (element) =>
    element ? bindStyle(element, style) : undefined;
