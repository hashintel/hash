import "./options.scss";
import "../shared/common.scss";

import { HashWordmark } from "../shared/hash-wordmark";

/**
 * This can be used for onboarding instructions, and for user preferences.
 *
 * Preferences should be persisted using browser.storage.sync
 * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/sync
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
      <p className="usage-instructions">
        <h4>Usage in Firefox</h4>
        To use the extension in Firefox, visit about:addons in your browser or
        click "Tools {">"} Addons" in the menu bar. Then click on HASH
        Assistant, select "Permissions", and:
        <ul>
          <li>
            Enable "Access your data for sites in the hash.ai domain" to use the
            extension
          </li>
          <li>
            Enable "Access your data for all web sites" if you want to read data
            from webpages you are visiting
          </li>
        </ul>
      </p>
    </div>
  );
};
