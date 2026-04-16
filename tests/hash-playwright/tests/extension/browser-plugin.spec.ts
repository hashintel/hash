// eslint-disable-next-line no-restricted-imports
import type { Page } from "@playwright/test";

import { expect, test } from "../shared/browser-plugin-fixtures/fixtures";
import { expectSignedIn, signInWithPassword } from "../shared/signin-utils";

const loggedOutHeaderLocator = "text=Connect to HASH";
const createAccountButtonLocator = "text=Create a free account";
const entityTypeSelectorLocator = '[placeholder="Search for types..."]';
const quickNoteInputLocator = '[placeholder="Start typing here..."]';

/**
 * Wait for the next debounced `updateEntity` mutation issued by the
 * popup's storage sync (`apps/plugin-browser/src/shared/storage.ts`).
 */
const waitForSettingsSave = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.url().endsWith("/graphql") &&
      response.status() === 200 &&
      (response.request().postData() ?? "").includes("mutation updateEntity"),
    { timeout: 5_000 },
  );

/**
 * Resolve once `chrome.storage.local` has been idle for 500 ms. The
 * popup fires several independent async loads on mount (`getUser`,
 * `useEntityTypes`) and each writes its own slice of state; interacting
 * before they settle risks later backfills racing with user actions.
 */
const waitForPopupStateLoaded = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const onChange = () => {
          if (timer) {
            clearTimeout(timer);
          }
          timer = setTimeout(() => {
            chrome.storage.onChanged.removeListener(onChange);
            resolve();
          }, 500);
        };
        chrome.storage.onChanged.addListener(onChange);
        onChange();
      }),
  );

type PopupTab = "one-off" | "automated" | "history";

/**
 * Navigate to the popup, wait for mount-time fetches to settle, then
 * switch to the given tab. Pins `popupTab` in `chrome.storage.local`
 * first so a late `getUser` write can't flip the tab back.
 */
const openPopupTab = async (page: Page, extensionId: string, tab: PopupTab) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await waitForPopupStateLoaded(page);
  await page.evaluate(
    async (targetTab) => chrome.storage.local.set({ popupTab: targetTab }),
    tab,
  );
  const label =
    tab === "one-off"
      ? "One-off"
      : tab === "automated"
        ? "Automated"
        : "History";
  await page.click(`text=${label}`);
  await waitForPopupStateLoaded(page);
};

/**
 * Type a name into an open entity-type autocomplete and select the
 * first matching option via ArrowDown + Enter.
 */
const selectEntityTypeOption = async (
  page: Page,
  name: string,
  { multiple = true }: { multiple?: boolean } = {},
) => {
  await page.keyboard.type(name);
  await expect(
    page.getByRole("option").filter({ hasText: name }).first(),
  ).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  if (multiple) {
    await expect(
      page
        .locator(".MuiChip-label")
        .filter({ hasText: new RegExp(`^${name}$`) }),
    ).toHaveCount(1);
  }
};

/**
 * Reset the one-off inference targets by writing an empty array to
 * `chrome.storage.local`. Direct writes avoid the per-chip-click
 * debounced backend saves and the race they cause with late `getUser`
 * writes; `useStorageSync` then re-renders the UI empty.
 */
const resetOneOffState = async (page: Page) => {
  await page.evaluate(async () => {
    const { manualInferenceConfig } = await chrome.storage.local.get(
      "manualInferenceConfig",
    );
    await chrome.storage.local.set({
      manualInferenceConfig: {
        ...(manualInferenceConfig ?? {}),
        targetEntityTypeIds: [],
      },
    });
  });
  await expect(page.locator(".MuiChip-deleteIcon")).toHaveCount(0);
  await waitForPopupStateLoaded(page);
  await expect(page.locator(".MuiChip-deleteIcon")).toHaveCount(0);
};

/** Reset automatic inference state; see {@link resetOneOffState}. */
const resetAutomatedState = async (page: Page) => {
  await page.evaluate(async () => {
    const { automaticInferenceConfig } = await chrome.storage.local.get(
      "automaticInferenceConfig",
    );
    await chrome.storage.local.set({
      automaticInferenceConfig: {
        ...(automaticInferenceConfig ?? {}),
        rules: [],
        enabled: false,
      },
    });
  });
  await expect(page.locator("tbody .MuiIconButton-root")).toHaveCount(0);
  await expect(page.locator("text=Disabled")).toBeVisible();
  await waitForPopupStateLoaded(page);
  await expect(page.locator("text=Disabled")).toBeVisible();
};

const signOutAndReloadPopup = async ({
  extensionId,
  page,
}: {
  extensionId: string;
  page: Page;
}) => {
  const avatar = page.locator(`[data-testid="user-avatar"]`);
  await page.goto("/");
  await avatar.click();
  await page.click("text=Sign Out");
  await expect(avatar).toBeHidden();

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.locator(loggedOutHeaderLocator)).toBeVisible();

  await signInWithPassword(page);
  await expectSignedIn(page);
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.locator("text=One-off")).toBeVisible();
};

test("popup window loads with logged-out state", async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(page.locator(loggedOutHeaderLocator)).toBeVisible();

  await expect(page.locator(createAccountButtonLocator)).toBeVisible();
});

test("popup window loads with logged-in state", async ({
  page,
  extensionId,
}) => {
  await signInWithPassword(page);
  await expectSignedIn(page);

  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(page.locator("text=One-off")).toBeVisible();
});

test("options page loads with logged-out state", async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(page.locator(loggedOutHeaderLocator)).toBeVisible();

  await expect(page.locator(createAccountButtonLocator)).toBeVisible();
});

test("options page loads with logged-in state", async ({
  page,
  extensionId,
}) => {
  await signInWithPassword(page);
  await expectSignedIn(page);

  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(page.locator("text=Welcome, Alice")).toBeVisible();
});

test("user can type a quick note which persists across logouts", async ({
  page,
  extensionId,
}) => {
  await signInWithPassword(page);
  await expectSignedIn(page);

  await openPopupTab(page, extensionId, "one-off");

  // Unique per-run value so the write is always observably different
  // from persisted backend state.
  const testQuickNote = `Hello, world! Here's a note ${Date.now()}`;
  await page.fill(quickNoteInputLocator, testQuickNote);

  // `setInLocalStorage` writes the draft to `chrome.storage.local`
  // immediately, but the backend `updateEntity` mutation fires after a
  // 1 s debounce. Playwright can't observe extension background
  // traffic, so we poll storage until the value lands, then wait for
  // the debounce + backend round-trip to complete before signing out.
  await page.waitForFunction(
    async (expected) => {
      const { draftQuickNote } =
        await chrome.storage.local.get("draftQuickNote");
      return draftQuickNote === expected;
    },
    testQuickNote,
    { timeout: 5_000 },
  );
  // The 1 s debounce must fire and the backend must respond before we
  // sign out, otherwise the old value survives. Two idle windows
  // (500 ms each) cover: debounce fires → storage write from the
  // response → idle.
  await waitForPopupStateLoaded(page);
  await waitForPopupStateLoaded(page);

  await signOutAndReloadPopup({ extensionId, page });
  await openPopupTab(page, extensionId, "one-off");

  await expect(page.locator(quickNoteInputLocator)).toHaveValue(testQuickNote);
});

// Selecting a type also adds its linked types as targets, so Actor +
// Document produces chips for [Actor, Block, Document, Has Indexed Content].
//
// @todo verify the correct WebSocket message is sent to the API when
//   `Suggest entities` is clicked — see
//   https://github.com/microsoft/playwright/issues/15684#issuecomment-1892644655
test("user can configure a one-off inference, and the settings are persisted", async ({
  page,
  extensionId,
}) => {
  await signInWithPassword(page);
  await expectSignedIn(page);

  await openPopupTab(page, extensionId, "one-off");
  await resetOneOffState(page);

  await page.click(entityTypeSelectorLocator);
  await selectEntityTypeOption(page, "Actor");
  await selectEntityTypeOption(page, "Document");

  // The Document selection resets the 1 s debounce, so the final
  // backend save contains both types. Register the listener after the
  // last selection to avoid matching an intermediate Actor-only save.
  await waitForSettingsSave(page);

  await signOutAndReloadPopup({ extensionId, page });
  await openPopupTab(page, extensionId, "one-off");

  const chipLabel = (name: string) =>
    page.locator(".MuiChip-label").filter({ hasText: new RegExp(`^${name}$`) });
  await expect(chipLabel("Actor")).toHaveCount(1);
  await expect(chipLabel("Document")).toHaveCount(1);
  await expect(chipLabel("Block")).toHaveCount(1);
  await expect(chipLabel("Has Indexed Content")).toHaveCount(1);
});

/**
 * @todo verify the correct WebSocket message is sent to the API when a
 *   page triggers automatic inference — see
 *   https://github.com/microsoft/playwright/issues/15684#issuecomment-1892644655
 */
test("user can enable automatic inference, and the settings are persisted", async ({
  page,
  extensionId,
}) => {
  await signInWithPassword(page);
  await expectSignedIn(page);

  await openPopupTab(page, extensionId, "automated");
  await resetAutomatedState(page);

  // `SelectScope` initializes `showTable` and `draftRule` from
  // `anyTypesSelected` in `useState`, so which button is shown depends
  // on whether the run started with any rules.
  const selectType = page.locator("text=Select type");
  const addAnother = page.locator("text=ADD ANOTHER");
  if ((await selectType.count()) > 0) {
    await selectType.click();
  } else {
    await addAnother.click();
  }
  await page.click(entityTypeSelectorLocator);
  await selectEntityTypeOption(page, "Actor", { multiple: false });

  const settingsSaved = waitForSettingsSave(page);
  await page.click("text=Disabled");
  await expect(page.locator("text=Enabled")).toBeVisible();
  await settingsSaved;

  await signOutAndReloadPopup({ extensionId, page });
  await openPopupTab(page, extensionId, "automated");
  await expect(page.locator("text=Enabled")).toBeVisible();
  await expect(page.locator("[value=Actor]")).toBeVisible();
});
