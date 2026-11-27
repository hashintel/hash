import { Fragment, useSyncExternalStore } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { noop } from "../../util/noop";
import {
  detectPlatform,
  keySeparator,
  resolveKeys,
  type KbdKeyName,
  type KbdPlatform,
} from "./kbd-util";
import { styles } from "./kbd.recipe";

export type { KbdKeyName };

export interface KbdProps {
  /**
   * Keys shown in the keycap: a `+`-separated string (`"mod+shift+z"`) or an array of key names.
   * `mod` shows `⌘` on Apple platforms and `Ctrl` elsewhere. For a literal `+` key, use `plus` or the array form.
   * Modifiers are shown first, in the platform's conventional order.
   */
  keys: KbdKeyName | readonly KbdKeyName[];
  /**
   * Color treatment of the keycap. `neutral` suits light surfaces such as menus;
   * `inherit` derives its colors from the surrounding text color, for tooltips and solid backgrounds.
   */
  variant?: "neutral" | "inherit";
  /** Keyboard layout whose key labels are shown. `auto` detects it from the browser; `apple` and `pc` pin it. */
  platform?: "auto" | KbdPlatform;
  className?: string;
}

const subscribeToPlatform = () => noop;
const getServerPlatform = (): KbdPlatform => "pc";

/**
 * Displays a key or key combination in a keycap, labelled for the user's
 * platform. Display only: it doesn't bind the shortcut.
 */
export const Kbd = ({
  keys,
  variant = "neutral",
  platform = "auto",
  className,
}: KbdProps) => {
  // Hydrates with the server's labels, then switches to the detected platform
  const detectedPlatform = useSyncExternalStore(
    subscribeToPlatform,
    detectPlatform,
    getServerPlatform,
  );
  const resolvedPlatform = platform === "auto" ? detectedPlatform : platform;
  const resolvedKeys = resolveKeys(keys, resolvedPlatform);

  if (resolvedKeys.length === 0) {
    return null;
  }

  const classes = styles({ variant, platform: resolvedPlatform });
  const separator = keySeparator[resolvedPlatform];

  return (
    <span
      className={cx(classes.root, className)}
      data-scope="kbd"
      data-part="root"
    >
      <span className={classes.label}>
        {resolvedKeys.map((key) => key.name).join(" ")}
      </span>
      <kbd className={classes.keycap} aria-hidden="true">
        {resolvedKeys.map((key, index) => (
          // eslint-disable-next-line react/no-array-index-key -- keys can repeat and never reorder
          <Fragment key={`${index}-${key.label}`}>
            {index > 0 && separator}
            <kbd className={classes.key}>{key.label}</kbd>
          </Fragment>
        ))}
      </kbd>
    </span>
  );
};

// Stable name for the docs Stage code serializer under minification
Kbd.displayName = "Kbd";
