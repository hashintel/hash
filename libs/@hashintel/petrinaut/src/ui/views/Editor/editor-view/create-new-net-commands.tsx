import { useCommand } from "../../../../react/commands/command-registry";

/**
 * Palette commands for the create-new flow. A no-op unless the host mounted a
 * `CommandRegistryProvider`.
 */
export const CreateNewNetCommands = ({
  enabled,
  showBrunchOptions,
  onBuildWithBrunch,
  onStartBlank,
}: {
  enabled: boolean;
  showBrunchOptions: boolean;
  onBuildWithBrunch: () => void;
  onStartBlank: () => void;
}) => {
  useCommand(
    {
      id: "petrinaut.net.new-build-with-brunch",
      label: "Build with Brunch",
      category: "Net",
      keywords: ["new", "file", "assistant", "empty"],
      run: onBuildWithBrunch,
    },
    { when: enabled && showBrunchOptions },
  );
  useCommand(
    {
      id: "petrinaut.net.new-start-blank",
      label: "Start a blank net",
      category: "Net",
      keywords: ["new", "file", "empty"],
      run: onStartBlank,
    },
    { when: enabled },
  );
  return null;
};
