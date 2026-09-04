# Recording the Petrinaut editor

What a scenario has to do to put the editor in a filmable state, and the traps
that waste takes.

## Where to point the recorder

| Target             | Command                                                                    | Port |
| ------------------ | -------------------------------------------------------------------------- | ---- |
| Website demo       | `yarn workspace @apps/petrinaut-website dev`                               | 5173 |
| Storybook          | `yarn workspace @hashintel/petrinaut dev`                                  | 6006 |
| A branch's preview | none — pass `--base-url https://petrinaut-git-<branch-slug>.stage.hash.ai` | —    |

The website serves the library's built output, so **rebuild before recording**
a change to it: `npx turbo run build --filter @hashintel/petrinaut`. A dev
server started before that build serves the previous bundle and will hash-miss
on reload; restart it after building.

## Seeding the state

Two `localStorage` keys, both read once at load, so `init` is the only place
they can be set:

```js
export const init = async (page) => {
  await page.addInitScript((net) => {
    localStorage.setItem(
      "petrinaut-sdcpn",
      JSON.stringify({
        "net-sir": {
          id: "net-sir",
          title: net.title,
          sdcpn: net.petriNetDefinition,
          lastUpdated: new Date().toISOString(),
        },
      }),
    );
    localStorage.setItem(
      "petrinaut:user-settings",
      JSON.stringify({
        showWalkthroughOnInit: false,
        isBottomPanelOpen: false,
        // The house look for a Petrinaut demo.
        useEntitiesTreeView: true,
        compactNodes: true,
        leftSidebarWidth: 240,
      }),
    );
  }, sirModel);
};
```

Models come from `libs/@hashintel/petrinaut-core/dist/examples` — build
`petrinaut-core` first, or the import fails. A feature behind a flag needs that
flag in the same settings object.

`leftSidebarWidth: 240` matters: the editor's own default is 320, a quarter of
a 1300px viewport, and the framing loses a zoom step to it.

## Reaching a view

Dismiss the tour, then switch modes. The segmented control ignores synthetic
clicks, so dispatch the event:

```js
const skip = page.getByRole("button", { name: "Skip tour" });
await skip
  .waitFor({ timeout: 15_000 })
  .then(() => skip.click())
  .catch(() => log("no tour"));
await page.getByRole("radio", { name: "simulate" }).dispatchEvent("click");
```

## Framing the canvas

The editor fits the view once, on load, caps that fit at zoom 1.1, and never
refits, so a net lands small in a wide viewport and there is no fit-view
control. `scripts/petrinaut-canvas.mjs` solves for the largest zoom whose pan
keeps the net inside the region the viewer can see:

```js
await frameNet(page, { viewport, leftEdge: 240, rightReserve: 380, log });
```

`rightReserve` holds back the width a panel will claim later in the take — the
properties panel opens on the first selection and the canvas does not refit, so
without it the nodes that panel covers leave the frame.

## Clicking things on the canvas

- **The left sidebar and the minimap swallow clicks** aimed at nodes under
  them. `selectNode(page, hud, id)` asserts the node ended up selected, so a
  swallowed click is an error rather than a take where nothing happens.
- **Selecting through the sidebar list is more reliable** than the canvas when
  the geometry does not matter: `page.getByRole("option", { name: "Susceptible" }).click()`.
- **Compact nodes are 180x49 flow units**, and a model's stock coordinates were
  placed for circles, so two pills can overlap and the click lands on whichever
  is on top. Seed a layout with at least a 460 pitch across.
- **Drag handlers register on mousedown**, so a synthetic drag must be
  `mouse.down()` → wait → `mouse.move()` → `mouse.up()`, or through the
  overlay's `hud.down()` / `hud.glide()` / `hud.up()`.
- **Monaco takes no synthetic keystrokes.** Scenario parameters and code
  editors are not drivable; change them by patching the seeded model.

## Scaling a run to the budget

The CPU pool takes about 4 s for 600 runs over a 180 s horizon, which fills a
5 s motion act. The GPU is far faster, and its histogram tops out at 255 tokens
per bin: a place value above that raises a red clamping toast that ruins the
last frame, so lower the population rather than the run count. Check the final
frame for a toast before sharing.

WebGPU is off in headless Chromium; export
`browserArgs = ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--use-angle=metal"]`
from the scenario and probe `navigator.gpu.requestAdapter()` once before
recording a GPU path.
