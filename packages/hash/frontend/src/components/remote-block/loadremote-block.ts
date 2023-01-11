import { ReactElement } from "react";

import { blockDependencies } from "../../../block.dependencies";
import { memoizeFetchFunction } from "../../lib/memoize";
import { crossFrameFetchFn } from "../sandbox/framed-block/util";

export type UnknownBlock =
  | string
  | typeof HTMLElement
  | ((...props: any[]) => ReactElement);

export type FetchSourceFn = (
  url: string,
  signal?: AbortSignal | undefined,
) => Promise<string>;

/**
 * Adapted from https://github.com/Paciolan/remote-module-loader
 */

const requires = (name: string) => {
  if (!(name in blockDependencies)) {
    throw new Error(
      `Could not require '${name}'. '${name}' does not exist in dependencies.`,
    );
  }

  return blockDependencies[name];
};

const defaultFetchFn: FetchSourceFn = (url, signal) =>
  fetch(url, { signal: signal ?? null }).then((data) => data.text());

type FetchAndParseFn = (
  fetchSourceFn: FetchSourceFn,
) => (
  url: string,
  signal?: AbortSignal,
) => Promise<string | Record<string, UnknownBlock>>;

const fetchAndParseBlock: FetchAndParseFn = (fetchSourceFn) => (url, signal) =>
  fetchSourceFn(url, signal).then((source) => {
    if (url.endsWith(".html")) {
      return source;
    }

    /**
     * Load a commonjs module from a url and wrap it/supply with key variables
     * @see https://nodejs.org/api/modules.html#modules_the_module_wrapper
     * @see https://github.com/Paciolan/remote-module-loader/blob/master/src/lib/loadRemoteModule.ts
     */
    const exports = {};
    const module = { exports };
    // eslint-disable-next-line no-new-func,@typescript-eslint/no-implied-eval
    const func = new Function("require", "module", "exports", source);
    func(requires, module, exports);

    /**
     * @todo check it's actually a React component or HTMLElement
     * */
    return module.exports;
  });

export const loadRemoteBlock = memoizeFetchFunction(
  fetchAndParseBlock(defaultFetchFn),
);

export const loadCrossFrameRemoteBlock = memoizeFetchFunction(
  fetchAndParseBlock(crossFrameFetchFn),
);
