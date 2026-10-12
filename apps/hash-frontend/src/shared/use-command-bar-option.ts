import { useEffect } from "react";

import type {
  CommandBarOption,
  CommandBarOptionCommand,
} from "./command-bar/command-bar-options";

export const useCommandBarOption = (
  option: CommandBarOption,
  command?: CommandBarOptionCommand,
) => {
  useEffect(() => {
    const deactivate = option.activate(command);

    return () => {
      deactivate();
    };
  }, [option, command]);
};
