import { Dispatch, SetStateAction, useCallback, useState } from "react";
import { useLocalstorageState } from "rooks";

export const useDefaultState = <
  T extends object | number | string | boolean | null | undefined,
>(
  defaultValue: T,
  produceNextValue: (nextValue: T, currentValue: T) => T = (nextValue) =>
    nextValue,
): [T, Dispatch<SetStateAction<T>>] => {
  const [{ prevDefault, currentValue }, setNextValue] = useState({
    prevDefault: defaultValue,
    currentValue: defaultValue,
  });

  if (prevDefault !== defaultValue) {
    setNextValue({
      prevDefault: defaultValue,
      currentValue: produceNextValue(defaultValue, currentValue),
    });
  }

  const setState = useCallback((value: SetStateAction<T>) => {
    setNextValue((prevValue) => {
      const nextValue =
        typeof value === "function" ? value(prevValue.currentValue) : value;

      return {
        ...prevValue,
        currentValue: nextValue,
      };
    });
  }, []);

  return [currentValue, setState];
};

// @todo - needs work to make this concurrency-compliant
// @see - https://github.com/hashintel/hash/pull/407#discussion_r834643556
export const useCachedDefaultState = <
  T extends object | number | string | boolean | null | undefined,
>(
  defaultValue: T,
  key: string,
  produceNextValue: (nextValue: T, currentValue: T) => T = (nextValue) =>
    nextValue,
): [T, Dispatch<SetStateAction<T>>] => {
  const [{ prevDefault, currentValue }, setNextValue] = useLocalstorageState(
    key,
    {
      prevDefault: defaultValue,
      currentValue: defaultValue,
    },
  );

  if (prevDefault !== defaultValue) {
    setNextValue({
      prevDefault: defaultValue,
      currentValue: produceNextValue(defaultValue, currentValue),
    });
  }

  const setState = useCallback(
    (value: SetStateAction<T>) => {
      setNextValue((prevValue) => {
        const nextValue =
          typeof value === "function" ? value(prevValue.currentValue) : value;

        return {
          ...prevValue,
          currentValue: nextValue,
        };
      });
    },
    [setNextValue],
  );

  return [currentValue, setState];
};
