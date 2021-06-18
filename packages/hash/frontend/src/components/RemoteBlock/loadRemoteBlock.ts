import { memoizeFetchFunction } from "../../lib/memoize";
import { blockDependencies } from "../../../block.dependencies";
import { UnknownComponent } from "./useRemoteBlock";

/**
 * Adapted from https://github.com/Paciolan/remote-module-loader
 */

const requires = (name: string) => {
  if (!(name in blockDependencies)) {
    throw new Error(
      `Could not require '${name}'. '${name}' does not exist in dependencies.`
    );
  }

  return blockDependencies[name];
};

export const loadRemoteBlock = memoizeFetchFunction((url, signal) =>
  fetch(url, { signal: signal ?? null })
    .then((data) => data.text())
    .then((source) => {
      if (url.endsWith(".html")) {
        return source as string;
      }

      /**
       * Load a commonjs module from a url and wrap it/supply with key variables
       * @see https://nodejs.org/api/modules.html#modules_the_module_wrapper
       * @see https://github.com/Paciolan/remote-module-loader/blob/master/src/lib/loadRemoteModule.ts
       */
      const exports = {};
      const module = { exports };
      const func = new Function("require", "module", "exports", source);
      func(requires, module, exports);

      /**
       * @todo check it's actually a React component
       * we can use a different rendering strategy for other component types
       * */
      return module.exports as Record<string, UnknownComponent>;
    })
);
