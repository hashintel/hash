/**
 * What a plugin contributes, as items for the Plugins section of User
 * settings. Read from the manifest, which is plain data, plus whether the
 * running plugin renders a root.
 */

import { isAssistantExtension, isAssistantProvider } from "./active-assistant";
import { pluginTokenEntries } from "./plugin-dependencies";

import type {
  PetrinautPluginButtonPlace,
  PetrinautPluginManifest,
  PetrinautSettingSection,
} from "./plugin-manifest";

export type PluginContributionKind =
  | "assistant"
  | "extension"
  | "button"
  | "top-bar-item"
  | "setting"
  | "flag"
  | "provides"
  | "requires"
  | "root";

export interface PluginContributionItem {
  readonly kind: PluginContributionKind;
  /** What is contributed: a label, an assistant's name, a service id. */
  readonly subject: string;
  /** Where it appears or how it applies, when the subject does not say. */
  readonly detail?: string;
}

const placeText: Record<PetrinautPluginButtonPlace, string> = {
  "top-bar-start": "Start of the top bar",
  "top-bar-end": "End of the top bar",
  "viewport-controls": "Viewport controls",
};

const sectionText: Record<PetrinautSettingSection, string> = {
  general: "General",
  viewport: "Viewport",
  labs: "Labs",
};

export const describePluginContributions = (
  manifest: PetrinautPluginManifest,
  context: {
    /** The assistant label of a plugin id, for extensions. */
    readonly assistantLabelOf: (pluginId: string) => string | undefined;
    /** Whether the running plugin returned a root this render. */
    readonly rendersRoot: boolean;
  },
): readonly PluginContributionItem[] => {
  const items: PluginContributionItem[] = [];
  if (isAssistantProvider(manifest)) {
    items.push({ kind: "assistant", subject: manifest.assistant.label });
  } else if (isAssistantExtension(manifest)) {
    const extended = manifest.assistant.extends;
    items.push({
      kind: "extension",
      subject: `${context.assistantLabelOf(extended) ?? extended} assistant`,
    });
  }
  for (const spec of Object.values(manifest.buttons ?? {})) {
    items.push({
      kind: "button",
      subject: spec.label,
      detail: placeText[spec.place],
    });
  }
  for (const [key, spec] of Object.entries(manifest.topBarItems ?? {})) {
    items.push({
      kind: "top-bar-item",
      subject: key,
      detail: placeText[spec.place],
    });
  }
  for (const spec of Object.values(manifest.settings ?? {})) {
    items.push({
      kind: "setting",
      subject: spec.label,
      detail: sectionText[spec.section ?? "general"],
    });
  }
  for (const spec of Object.values(manifest.flags ?? {})) {
    items.push({ kind: "flag", subject: spec.label, detail: "Labs" });
  }
  for (const [, token] of pluginTokenEntries(manifest.provides)) {
    items.push({ kind: "provides", subject: token.id });
  }
  for (const [, token] of pluginTokenEntries(manifest.requires)) {
    items.push(
      token.required
        ? { kind: "requires", subject: token.id }
        : { kind: "requires", subject: token.id, detail: "Optional" },
    );
  }
  if (context.rendersRoot) {
    items.push({ kind: "root", subject: "Inside the editor" });
  }

  return items;
};
