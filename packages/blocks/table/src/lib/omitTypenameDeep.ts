import { cloneDeepWith } from "lodash";

export function omitTypenameDeep<T>(data: T): T {
  return cloneDeepWith(data, (value) => {
    if (value?.__typename) {
      const { __typename, ...valueWithoutTypename } = value;
      return omitTypenameDeep<T>(valueWithoutTypename);
    }
  });
}
