import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { sleep } from "@local/hash-isomorphic-utils/sleep";
import type {
  GraphChangeNotification,
  OccurredInEntity,
} from "@local/hash-isomorphic-utils/system-types/graphchangenotification";
import type { Page } from "@local/hash-isomorphic-utils/system-types/shared";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";

import { createEntity, getUser } from "./shared/api-queries";
import { loginUsingTempForm } from "./shared/login-using-temp-form";
import type { APIRequestContext } from "./shared/runtime";
import { expect, test } from "./shared/runtime";

const createNotification = async ({
  draft,
  requestContext,
  targetEntityTitle,
}: {
  draft: boolean;
  requestContext: APIRequestContext;
  targetEntityTitle: string;
}) => {
  const user = await getUser(requestContext);
  if (!user) {
    throw new Error("Cannot create notification without authenticated user");
  }

  const ownedById = extractOwnedByIdFromEntityId(
    user.metadata.recordId.entityId,
  );

  const targetEntity = await createEntity<Page>(requestContext, {
    draft,
    entityTypeIds: [systemEntityTypes.page.entityTypeId],
    ownedById,
    properties: {
      value: {
        "https://hash.ai/@hash/types/property-type/title/": {
          value: targetEntityTitle,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
        "https://hash.ai/@hash/types/property-type/fractional-index/": {
          value: "a0",
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
      },
    },
  });

  const notificationEntity = await createEntity<GraphChangeNotification>(
    requestContext,
    {
      draft: false,
      entityTypeIds: [systemEntityTypes.graphChangeNotification.entityTypeId],
      ownedById,
      properties: {
        value: {
          "https://hash.ai/@hash/types/property-type/graph-change-type/": {
            value: "create",
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
      },
    },
  );

  await createEntity<OccurredInEntity>(requestContext, {
    draft,
    entityTypeIds: [systemLinkEntityTypes.occurredInEntity.linkEntityTypeId],
    linkData: {
      leftEntityId: notificationEntity.metadata.recordId.entityId,
      rightEntityId: targetEntity.metadata.recordId.entityId,
    },
    ownedById,
    properties: {
      value: {
        "https://hash.ai/@hash/types/property-type/entity-edition-id/": {
          value:
            targetEntity.metadata.temporalVersioning.decisionTime.start.limit,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
      },
    },
  });

  return targetEntityTitle;
};

test("new notifications are shown on notifications page", async ({ page }) => {
  await loginUsingTempForm({
    page,
    userEmail: "alice@example.com",
    userPassword: "password",
  });

  await expect(page.locator("text=Get support")).toBeVisible();

  await page.goto("/notifications");

  await page.waitForURL((url) => url.pathname === "/notifications");

  const draftNotificationTitle = new Date().toISOString();

  await expect(
    page.locator(`text=${draftNotificationTitle}`),
  ).not.toBeVisible();

  /** Check notifications linked to draft entities */
  await createNotification({
    draft: true,
    requestContext: page.request,
    targetEntityTitle: draftNotificationTitle,
  });

  /** Wait for the notification poll interval to expire */
  await sleep(12_000);

  await expect(page.locator(`text=${draftNotificationTitle}`)).toBeVisible();

  const nonDraftNotificationTitle = new Date().toISOString();

  await expect(
    page.locator(`text=${nonDraftNotificationTitle}`),
  ).not.toBeVisible();

  /** Check notifications linked to non-draft entities */
  await createNotification({
    draft: false,
    requestContext: page.request,
    targetEntityTitle: nonDraftNotificationTitle,
  });

  /** Wait for the notification poll interval to expire */
  await sleep(12_000);

  await expect(page.locator(`text=${nonDraftNotificationTitle}`)).toBeVisible();
});
