# HASH Browser Plugin

## Download

We will provide download links and instructions for getting set up in the following browsers here, upon the public beta release:

- Chrome
- Firefox
- Safari
- Edge
- Arc Browser

We also intend to support iOS Safari in the future.

## User Guide

We will add a link to the user guide for the plugin here, when it is available.

## Development

1. Install dependencies: `yarn`
1. Either have the API running locally, or add an `.env.local` to set the API_ORIGIN to the desired API
1. Run and load extension:
   - in Chrome:
   - 1. `yarn dev`
     1. [chrome://extensions](chrome://extensions)
     1. Toggle 'Developer mode'
     1. Click 'Load unpacked' and select the `build` folder
   - in Firefox:
     1. `yarn dev:firefox`
     1. [about:debugging#/runtime/this-firefox](about:debugging#/runtime/this-firefox)
     1. Click 'Load Temporary Add-on...' and select the `manifest.json` file in the `build` folder

**Pages** (the `popup` and `options` screens) will reload automatically when changes are made.
**Scripts** (`background`, `content`) require clicking 'Update' in [Chrome](chrome://extensions) or 'Reload' in [Firefox](about:debugging#/runtime/this-firefox)
– if it seems that a change is not taking effect, 'Remove' and then 'Load unpacked' or 'Load Temporary Add-on...' again.

You can **change the target API** in development in the 'Automated' tab (to become 'Settings'). This will override the value set by environment variable.
The target frontend URL is **not** configurable in this way, because it would involve introducing asynchronous code to generate links,
which is all that the frontend URL is used for. You will need to replace the frontend URL you are sent to manually if needed,
e.g. when you click on a link, replace 'http://localhost:3000' with 'https://app.hash.ai' in the link, or vice-versa.

### Permissions

In Firefox, the following permissions via Tools-Addons must be set before the extension will work:

1. "Access your data for sites in the hash.ai domain" so that cookies will be sent to the HASH API
1. "Access your data for all web sites" so that content can be read from any other websites

### Debugging

The components of the extension run in different browser contexts.

In **Chrome**:

- the **background** script from [chrome://extensions](chrome://extensions) > HASH Browser Extension > 'Inspect'
- the **content** script runs in whatever page is being viewed
- the **popup** can be debugged by inspecting its window
- the **options** page can be debugged by inspecting its window

In **Firefox**:

- the **background** script from [about:debugging#/runtime/this-firefox](about:debugging#/runtime/this-firefox) > HASH Browser Extension > 'Inspect'
- the **content** script runs in whatever page is being viewed
- the **popup** requires enabling and running the [Browser Toolbox](https://firefox-source-docs.mozilla.org/devtools-user/browser_toolbox/index.html)
