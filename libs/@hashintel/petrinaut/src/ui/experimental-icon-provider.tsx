import { IconProvider, type IconPack } from "@hashintel/ds-components";
import {
  HashIconProvider as IconSetProvider,
  hashIconPack,
  useHashIconPackEnabled,
} from "@hashintel/ds-icons";

import type { HashIconDefaults } from "@hashintel/ds-icons";
import type { PropsWithChildren } from "react";

const defaultIconPack: IconPack = {};

const ExperimentalIconPackProvider = ({ children }: PropsWithChildren) => {
  const enabled = useHashIconPackEnabled();
  return (
    <IconProvider
      icons={
        enabled ? (hashIconPack satisfies Required<IconPack>) : defaultIconPack
      }
    >
      {children}
    </IconProvider>
  );
};

export const ExperimentalIconProvider = ({
  children,
  ...props
}: PropsWithChildren<HashIconDefaults & { enabled?: boolean }>) => (
  <IconSetProvider {...props}>
    <ExperimentalIconPackProvider>{children}</ExperimentalIconPackProvider>
  </IconSetProvider>
);

export { ExperimentalIconProvider as PetriconProvider };
