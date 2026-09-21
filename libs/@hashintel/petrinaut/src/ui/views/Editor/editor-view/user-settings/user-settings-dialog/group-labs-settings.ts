import type { PetrinautLabsSetting } from "../../../../../types/petrinaut-labs-setting";

/**
 * Collects host-contributed Labs settings under their group headings, keeping
 * each group in the position of its first setting.
 */
export const groupLabsSettings = (
  settings: readonly PetrinautLabsSetting[],
): { group: string; settings: PetrinautLabsSetting[] }[] => {
  const groups = new Map<string, PetrinautLabsSetting[]>();
  for (const setting of settings) {
    const existing = groups.get(setting.group);
    if (existing) {
      existing.push(setting);
    } else {
      groups.set(setting.group, [setting]);
    }
  }
  return [...groups].map(([group, grouped]) => ({ group, settings: grouped }));
};
