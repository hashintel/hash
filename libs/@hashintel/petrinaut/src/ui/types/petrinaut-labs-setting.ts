/**
 * A setting the host contributes to the Labs section of the settings dialog.
 *
 * The editor renders it with the same row, label, and switch as its own Labs
 * settings, so a host-owned preference reads as part of the dialog without the
 * host styling anything. Settings sharing a `group` render under one heading,
 * in the order they are given, after the editor's own groups.
 */
export type PetrinautLabsSetting = {
  /** Unique key for React rendering. */
  key: string;
  /** Heading the setting renders under. */
  group: string;
  /** Name of the setting. */
  label: string;
  /** Sentence saying what the setting does. */
  description: string;
  /** Whether the setting is on. */
  value: boolean;
  /** Called with the new state when the switch is flipped. */
  onChange: (value: boolean) => void;
};
