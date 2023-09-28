import "./options.scss";
import "../shared/common.scss";

import { HashWordmark } from "../shared/hash-wordmark";

/**
 * This can be used for onboarding instructions, and for user preferences.
 *
 * Preferences should be persisted using chrome.storage.sync
 * @see https://developer.chrome.com/docs/extensions/reference/storage/
 */
export const Options = () => {
  return (
    <div className="options">
      <h1>
        <HashWordmark />
      </h1>
      <p>
        This is the settings page for the extension. People will see this when
        the extension is first installed, or when they select "settings" from
        the extensions page.
      </p>
    </div>
  );
};
