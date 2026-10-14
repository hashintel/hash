import {
  InheritedConstraintsContext,
  useInheritedConstraintsValue,
} from "./use-inherited-constraints";

import type { ReactNode } from "react";

export const InheritedConstraintsProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const inheritedConstraints = useInheritedConstraintsValue();

  return (
    <InheritedConstraintsContext.Provider value={inheritedConstraints}>
      {children}
    </InheritedConstraintsContext.Provider>
  );
};
