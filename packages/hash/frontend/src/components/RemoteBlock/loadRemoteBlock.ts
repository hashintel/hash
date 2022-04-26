import { memoizeFetchFunction } from "../../lib/memoize";
import { blockDependencies } from "../../../block.dependencies";
import { crossFrameFetchFn } from "../sandbox/FramedBlock/util";

export type UnknownComponent = (...props: any[]) => JSX.Element;

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
) => Promise<string | Record<string, UnknownComponent>>;

const fetchAndParseBlock: FetchAndParseFn = (fetchSourceFn) => (url, signal) =>
  fetchSourceFn(url, signal).then((source) => {
    if (url.endsWith(".html")) {
      return source;
    }
    // console.log("url => ", url);
    // console.log("source => ", source);
    // debugger;
    /**
     * Load a commonjs module from a url and wrap it/supply with key variables
     * @see https://nodejs.org/api/modules.html#modules_the_module_wrapper
     * @see https://github.com/Paciolan/remote-module-loader/blob/master/src/lib/loadRemoteModule.ts
     */
    const exports = {};
    const module = { exports };
    // eslint-disable-next-line no-new-func,@typescript-eslint/no-implied-eval
    const func = new Function(
      "require",
      "module",
      "exports",
      // this is a hack to ensure the absolute path for bundles is always
      // used and not relative ones.
      // This fixes a problem we have with code splitted bundles where
      // the absolute bundle path generated based on the current page url
      // and not the url where the block is served
      source.replace(`=>"main."+`, `=>"${url.split("/main.")[0]}/main."+`),
    );

    func(requires, module, exports);

    /**
     * @todo check it's actually a React component
     * we can use a different rendering strategy for other component types
     * */
    return module.exports as Record<string, UnknownComponent>;
  });

export const loadRemoteBlock = memoizeFetchFunction(
  fetchAndParseBlock(defaultFetchFn),
);

export const loadCrossFrameRemoteBlock = memoizeFetchFunction(
  fetchAndParseBlock(crossFrameFetchFn),
);
