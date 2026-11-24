import { useEffect, useEffectEvent } from "react";

import { useCommand } from "../../../../react/commands/command-registry";
import {
  usePetrinautNavigate,
  usePetrinautNavigationState,
} from "../../../../react/navigation/navigation";
import { UserSettingsDialog } from "./user-settings/user-settings-dialog";

export const UserSettings = () => {
  const navigate = usePetrinautNavigate();
  const section = usePetrinautNavigationState(({ overlay }) =>
    overlay?.type === "user-settings"
      ? (overlay.section ?? "general")
      : overlay?.type === "viewport-settings"
        ? "viewport"
        : null,
  );

  const openSettings = () => {
    if (section === null) {
      navigate(
        { overlay: { type: "user-settings", section: "general" } },
        { cause: "user", action: "overlay" },
      );
    }
  };

  useCommand({
    id: "petrinaut.settings.open",
    label: "Open user settings",
    category: "Editor",
    keywords: [
      "preferences",
      "viewport",
      "animations",
      "theme",
      "experimental",
    ],
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
      onSectionChange={(nextSection) =>
        navigate(
          { overlay: { type: "user-settings", section: nextSection } },
          { cause: "user", action: "overlay", phase: "continue" },
        )
      }
      onClose={() =>
        navigate({ overlay: null }, { cause: "user", action: "overlay" })
      }
    />
  );
};
