import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getUser } from "./api-queries";
import { expect } from "./runtime";

import type { Page } from "./runtime";

/**
 * Open the home page and wait until the sidebar's create-page button will
 * navigate to the page it creates. `useCreatePage` only navigates once the
 * web owner's shortname has been fetched, and nothing in the sidebar renders
 * from that query, so wait for its response as well as for the page list.
 */
export const openHomeReadyToCreatePage = async (page: Page) => {
  const user = await getUser(page.request);
  if (!user) {
    throw new Error("Cannot create a page without an authenticated user");
  }

  const webId = extractWebIdFromEntityId(user.metadata.recordId.entityId);

  const webOwnerFetched = page.waitForResponse((response) => {
    const postData = response.request().postData() ?? "";

    return (
      response.url().includes("/graphql") &&
      postData.includes("queryEntitySubgraph") &&
      postData.includes(`{"path":["uuid"]},{"parameter":"${webId}"}`) &&
      postData.includes(systemEntityTypes.user.entityTypeBaseUrl) &&
      postData.includes('"traversalPaths":[]')
    );
  });

  await page.goto("/");
  await webOwnerFetched;
  await expect(page.getByTestId("pages-tree")).toBeAttached();
};
