import { useEffect, useEffectEvent } from "react";

import { useCommand } from "../../../../react/commands/command-registry";
import { usePetrinautNavigation } from "../../../../react/navigation";
import { UserSettingsDialog } from "./user-settings/user-settings-dialog";

import type { PetrinautLabsSetting } from "../../../types/petrinaut-labs-setting";

export const UserSettings = ({
  labsSettings,
}: {
  labsSettings?: readonly PetrinautLabsSetting[];
}) => {
  const navigation = usePetrinautNavigation();
  const overlay = navigation.state.overlay;
  const section =
    overlay?.type === "user-settings"
      ? (overlay.section ?? "general")
      : overlay?.type === "viewport-settings"
        ? "viewport"
        : null;

  const openSettings = () => {
    if (section === null) {
      navigation.navigate(
        { overlay: { type: "user-settings", section: "general" } },
        { cause: "user", action: "overlay" },
      );
    }
  };

  useCommand({
    id: "petrinaut.settings.open",
    label: "Open user settings",
    category: "Editor",
    keywords: ["preferences", "viewport", "animations", "experimental"],
    shortcut: "mod+,",
    run: openSettings,
  });

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      !event.defaultPrevented &&
      !event.repeat &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key === ","
    ) {
      event.preventDefault();
      event.stopPropagation();
      openSettings();
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return section === null ? null : (
    <UserSettingsDialog
      section={section}
      labsSettings={labsSettings}
      onSectionChange={(nextSection) =>
        navigation.navigate(
          { overlay: { type: "user-settings", section: nextSection } },
          { cause: "user", action: "overlay", phase: "continue" },
        )
      }
      onClose={() =>
        navigation.navigate(
          { overlay: null },
          { cause: "user", action: "overlay" },
        )
      }
    />
  );
};
