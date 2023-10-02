# HASH Browser Plugin

## Development

1. Install dependencies: `yarn`
1. Run dev server: `yarn dev`
1. Load extension:
   - in Chrome:
     1. [chrome://extensions](chrome://extensions)
     1. Toggle 'Developer mode'
     1. Click 'Load unpacked' and select the `build` folder
   - in Firefox:
     1. [about:debugging#/runtime/this-firefox](about:debugging#/runtime/this-firefox)
     1. Click 'Load Temporary Add-on...' and select the `manifest.json` file in the `build` folder

**Pages** will reload (the `popup` and `options` screens).
**Scripts** (`background`, `content`) require clicking 'Update' in [chrome://extensions](chrome://extensions).

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
