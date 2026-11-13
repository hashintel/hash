import { expect, type Request, test } from "../shared/runtime";
import {
  clearSessionCookies,
  expectSignedIn,
  expectSignedOut,
  signInWithPassword,
} from "../shared/signin-utils";
import { createUserAndCompleteSignup } from "../shared/signup-utils";
import { testUsers } from "../shared/test-users";

test("user can sign in with password", async ({ page }) => {
  const credentials = await createUserAndCompleteSignup(
    page,
    testUsers.signinTest,
  );

  await clearSessionCookies(page);
  await expectSignedOut(page);

  await signInWithPassword(page, credentials);
  await expectSignedIn(page);
});

test("user can sign out while the data type catalogue is loading", async ({
  page,
}) => {
  await createUserAndCompleteSignup(page, testUsers.signoutTest);

  const isCatalogueRequest = (request: Request) => {
    if (
      request.method() !== "POST" ||
      !/\/graphql(?:\?|$)/.test(request.url())
    ) {
      return false;
    }

    const { operationName } = request.postDataJSON() as {
      operationName: string;
    };

    return ["queryDataTypeSubgraph", "queryDataTypes"].includes(operationName);
  };

  await page.route(/\/graphql(?:\?|$)/, async (route) => {
    if (isCatalogueRequest(route.request())) {
      return;
    }

    await route.continue();
  });

  const catalogueRequest = page.waitForRequest(isCatalogueRequest);

  await page.reload();
  await catalogueRequest;

  await page.getByTestId("user-avatar").click();
  await page.getByText("Sign Out").click();

  await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible({
    timeout: 5_000,
  });
});
