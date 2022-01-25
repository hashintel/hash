// @todo this should be defined elsewhere

import { FileProperties } from "./graphql/apiTypes.gen";

export { topologicalSort, treeFromParentReferences } from "../../api/src/util";

export type DistributiveOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;

export type DistributivePick<T, K extends keyof T> = T extends unknown
  ? Pick<T, K>
  : never;

/**
 * @see https://github.com/microsoft/TypeScript/issues/25720#issuecomment-533438205
 */
export const isUnknownObject = (
  x: unknown,
): x is { [key in PropertyKey]: unknown } =>
  x !== null && typeof x === "object";

/**
 * This allows you to collect calls to a function to run at the end of a tick
 */
export const collect = <P extends Array<any>>(
  handler: (calls: P[]) => void,
): ((...args: P) => void) => {
  let id: ReturnType<typeof setImmediate> | null = null;
  let calls: P[] = [];

  return (...args: P) => {
    if (id !== null) {
      clearImmediate(id);
      id = null;
    }

    calls.push(args);

    id = setImmediate(() => {
      const thisCalls = calls;
      calls = [];
      handler(thisCalls);
    });
  };
};

type Entries<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

/**
 * @see https://stackoverflow.com/a/60142095
 */
export const typeSafeEntries = <T>(obj: T): Entries<T> =>
  Object.entries(obj) as any;

export const isFileProperties = (props: {}): props is FileProperties => {
  return (
    "key" in props &&
    "size" in props &&
    "url" in props &&
    "storageType" in props
  );
};
