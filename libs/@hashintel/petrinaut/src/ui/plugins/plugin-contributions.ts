/** What a plugin declares, as tags for its row in the Plugins section. */

import { formatShortcutKeys } from "../../react/commands/format-shortcut";

import type {
  PetrinautPluginManifest,
  PluginButtonPlace,
  PluginSettingSection,
} from "./define-petrinaut-plugin";

export type PluginContributionKind =
  | "access"
  | "button"
  | "top-bar-item"
  | "command"
  | "setting"
  | "provides"
  | "root";

export interface PluginContributionItem {
  readonly kind: PluginContributionKind;
  /** What is contributed: a family, a label, a key. */
  readonly subject: string;
  /** Where it appears or how far it reaches, when the subject does not say. */
  readonly detail?: string;
}

const placeText: Record<PluginButtonPlace, string> = {
  "top-bar-start": "Start of the top bar",
  "top-bar-end": "End of the top bar",
  "viewport-controls": "Viewport controls",
};

const sectionText: Record<PluginSettingSection, string> = {
  general: "General",
  viewport: "Viewport",
  labs: "Labs",
};

export const describePluginContributions = (
  manifest: PetrinautPluginManifest,
): readonly PluginContributionItem[] => [
  ...Object.entries(manifest.access ?? {}).map(([family, level]) => ({
    kind: "access" as const,
    subject: family,
    detail: level === "write" ? "Read and change" : "Read",
  })),
  ...Object.values(manifest.buttons ?? {}).map((spec) => ({
    kind: "button" as const,
    subject: spec.label,
    detail: placeText[spec.place],
  })),
  ...Object.entries(manifest.topBarItems ?? {}).map(([key, spec]) => ({
    kind: "top-bar-item" as const,
    subject: key,
    detail: placeText[spec.place],
  })),
  ...Object.values(manifest.commands ?? {}).map((spec) => ({
    kind: "command" as const,
    subject: spec.label,
    ...(spec.shortcut !== undefined && {
      detail: formatShortcutKeys(spec.shortcut).join(" "),
    }),
  })),
  ...Object.values(manifest.settings ?? {}).map((spec) => ({
    kind: "setting" as const,
    subject: spec.label,
    detail: sectionText[spec.section ?? "general"],
  })),
  ...(manifest.provides === undefined
    ? []
    : [{ kind: "provides" as const, subject: manifest.id }]),
  ...(manifest.root === true
    ? [{ kind: "root" as const, subject: "Inside the editor" }]
    : []),
];
