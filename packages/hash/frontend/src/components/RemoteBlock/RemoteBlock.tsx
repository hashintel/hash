import React, { useEffect, useState, VoidFunctionComponent } from "react";

/**
 * Adapted from https://github.com/Paciolan/remote-module-loader
 * and https://github.com/Paciolan/remote-component
 */

/**
 * Memoize a function result based on a single argument
 * https://github.com/Paciolan/remote-module-loader/blob/master/src/lib/memoize.ts
 */
function memoize<T>(func: (arg: string) => T): (arg: string) => T {
  const cache: Record<string, any> = {};
  return (key: string) => {
    if (cache[key] == null) {
      cache[key] = func(key);
    }
    return cache[key];
  };
}

const createRequires = () => {
  const dependencies = require("../../../block.dependencies");

  return (name: string) => {
    if (!(name in dependencies)) {
      throw new Error(
        `Could not require '${name}'. '${name}' does not exist in dependencies.`
      );
    }

    return dependencies[name];
  };
};

/**
 * Load a commonjs module from a url and wrap it/supply with key variables
 * @see https://nodejs.org/api/modules.html#modules_the_module_wrapper
 * @see https://github.com/Paciolan/remote-module-loader/blob/master/src/lib/loadRemoteModule.ts
 */
export const loadRemoteModule = memoize((url) =>
  fetch(url)
    .then((data) => data.text())
    .then((source) => {
      const requires = createRequires();

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

type UnknownComponent = (...props: unknown[]) => JSX.Element;

type UseRemoteBlockHook = {
  (url: string): [boolean, Error | undefined, UnknownComponent | undefined];
};

type UseRemoteComponentState = {
  loading: boolean;
  err?: Error | undefined;
  component?: UnknownComponent | undefined;
};

/**
 * @see https://github.com/Paciolan/remote-component/blob/master/src/hooks/useRemoteComponent.ts
 */
const useRemoteComponent: UseRemoteBlockHook = (url) => {
  const [{ loading, err, component }, setState] =
    useState<UseRemoteComponentState>({
      loading: true,
      err: undefined,
      component: undefined,
    });

  useEffect(() => {
    let update = setState;
    update({ loading: true, err: undefined, component: undefined });
    loadRemoteModule(url)
      .then((module) =>
        update({ loading: false, err: undefined, component: module.default })
      )
      .catch((err) => update({ loading: false, err, component: undefined }));

    return () => {
      // invalidate update function for stale closures
      update = () => {
        // this function is left intentionally blank
      };
    };
  }, [url]);

  return [loading, err, component];
};

type RemoteBlockProps = {
  url: string;
};

/**
 * @see https://github.com/Paciolan/remote-component/blob/2b2cfbb5b6006117c56f3aa7daa2292d3823bb83/src/createRemoteComponent.tsx
 */
export const RemoteBlock: VoidFunctionComponent<RemoteBlockProps> = ({
  url,
  ...props
}) => {
  const [loading, err, Component] = useRemoteComponent(url);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (err || !Component) {
    return (
      <div>
        URL must point to a folder containing metadata.json
      </div>
    );
    // return <div>Unknown Error: {(err || "UNKNOWN").toString()}</div>;
  }

  return <Component {...props} />;
};
