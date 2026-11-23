import { use } from "react";

import { NetManagementContext } from "../../../../react/host/net-management-context";
import { useEditorActions } from "../../../../react/state/editor-context";

/** Opens an untitled net with nothing in it. */
export const useCreateEmptyNet = () => {
  const { createNewNet } = use(NetManagementContext);
  const { clearSelection } = useEditorActions();

  return () => {
    createNewNet({
      title: "Untitled",
      petriNetDefinition: {
        places: [],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
        components: [],
        componentInstances: [],
      },
    });
    clearSelection();
  };
};
