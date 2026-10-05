import { useCommand } from "../../../../react/commands/command-registry";

/**
 * Palette command for the create-new flow. A no-op unless the host mounted a
 * `CommandRegistryProvider`.
 */
export const CreateNewNetCommands = ({
  enabled,
  onStartBlank,
}: {
  enabled: boolean;
  onStartBlank: () => void;
}) => {
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
