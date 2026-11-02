import { createEntityType, updateEntityType } from "../shared/api-queries";
import { openTypePage, randomTypeName } from "../shared/entity-type-editor";
import {
  allVersionsResult,
  companyBaseUrl,
  latestVersionsResult,
} from "../shared/prototype-ontology";
import { expect, test } from "../shared/runtime";

import type { Page } from "../shared/runtime";
import type { EntityTypeWithMetadata } from "@blockprotocol/type-system";

/**
 * Creates a type at v3, as Company is in the prototype, and answers the
 * section's two queries for it with the prototype's example ontology.
 */
const openPrototypeOntology = async (
  page: Page,
  { cursor, fail }: { cursor?: boolean; fail?: boolean } = {},
) => {
  const parentName = randomTypeName();
  const schema = {
    title: parentName,
    description: "Test Entity",
    type: "object" as const,
    properties: {},
  };
  let parent: EntityTypeWithMetadata = await createEntityType(
    page.request,
    schema,
  );
  for (let version = 2; version <= 3; version += 1) {
    parent = await updateEntityType(page.request, {
      entityTypeId: parent.schema.$id,
      updatedEntityType: schema,
    });
  }
  const parentBaseUrl = parent.metadata.recordId.baseUrl;

  /** The fixture's types, extending the new type instead of Company. */
  const respondWith = (result: { entityTypes: EntityTypeWithMetadata[] }) =>
    JSON.parse(
      JSON.stringify({
        data: {
          queryEntityTypes: {
            ...result,
            ...(cursor
              ? { cursor: result.entityTypes.at(-1)?.schema.$id }
              : {}),
          },
        },
      }).replaceAll(companyBaseUrl, parentBaseUrl),
    ) as unknown;

  await page.route(
    (url) => url.pathname === "/graphql",
    async (route) => {
      const body = route.request().postDataJSON() as {
        operationName?: string;
        variables?: { request?: { filter?: unknown } };
      } | null;
      const filter = JSON.stringify(body?.variables?.request?.filter ?? null);

      if (
        body?.operationName !== "queryEntityTypes" ||
        !filter.includes("inheritsFrom(inheritanceDepth=0)") ||
        !filter.includes(parentBaseUrl)
      ) {
        await route.fallback();
        return;
      }

      // The real response carries the API's CORS headers; only its body is replaced.
      const response = await route.fetch();

      if (fail) {
        await route.fulfill({
          response,
          json: {
            errors: [
              {
                message: "The Graph is unavailable",
                extensions: { code: "INTERNAL_SERVER_ERROR" },
              },
            ],
          },
        });
        return;
      }

      await route.fulfill({
        response,
        json: respondWith(
          filter.includes('"latest"')
            ? latestVersionsResult
            : allVersionsResult,
        ),
      });
    },
  );

  await openTypePage(page, new URL(parentBaseUrl).pathname.replace(/\/$/, ""));

  return {
    parentName,
    section: page.getByRole("region", {
      name: `Types that extend ${parentName}`,
    }),
  };
};

const toggleNames = (section: ReturnType<Page["getByRole"]>) =>
  section
    .getByRole("button", { expanded: false })
    .or(section.getByRole("button", { expanded: true }))
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")),
    );

test("the table shows the prototype's example ontology by child type", async ({
  page,
}) => {
  const { parentName: x, section } = await openPrototypeOntology(page);

  await expect(
    section.getByRole("button", { name: /^Subsidiary v26/ }),
  ).toBeVisible();
  expect(await toggleNames(section)).toEqual([
    `Charity v3, versions v1–v3, extends ${x} v1, v2, v3`,
    `Form 8-K Issuer v3, versions v2–v3, extends ${x} v3`,
    `Form 10-K Issuer v4, versions v1–v4, extends ${x} v1`,
    `Partnership v3, versions v1–v3, extends ${x} v2`,
    `Public Company v6, versions v1–v6, extends ${x} v1, v2`,
    `Sole Trader v4, versions v1–v4, extends ${x} v2, v3`,
    `Subsidiary v26, versions v1–v26, extends ${x} v1, v2, v3`,
  ]);

  await section.getByRole("button", { name: /^Partnership v3/ }).click();
  const partnership = section.getByRole("group", {
    name: "Version ranges of Partnership",
  });
  await expect(
    partnership.getByRole("button", { name: /^Open Partnership/ }),
  ).toHaveCount(2);
  await expect(
    partnership.getByRole("button", {
      name: "Open Partnership v1, the highest version in v1",
    }),
  ).toBeVisible();
  await expect(
    partnership.getByRole("button", {
      name: "Open Partnership v3, the highest version in v3",
    }),
  ).toBeVisible();

  await section.getByRole("button", { name: /^Public Company v6/ }).click();
  const publicCompany = section.getByRole("group", {
    name: "Version ranges of Public Company",
  });
  for (const name of [
    "Open Public Company v3, the highest version in v1–v3",
    "Open Public Company v5, the highest version in v3–v5",
    "Open Public Company v6, the highest version in v6",
  ]) {
    await expect(publicCompany.getByRole("button", { name })).toBeVisible();
  }

  await section.getByRole("switch", { name: "Current children only" }).click();
  await expect(
    section.getByRole("button", {
      name: `Holding Company, former, versions v1, extends ${x} v1`,
    }),
  ).toBeVisible();
  await expect(
    section.getByRole("button", {
      name: `Shell Company, former, versions v1–v2, extends ${x} v1`,
    }),
  ).toBeVisible();
  await expect(
    section.getByRole("button", { name: /UK Public Company/ }),
  ).toHaveCount(0);
});

test("the version graph tooltip opens on focus, at the newest versions, and closes on Escape", async ({
  page,
}) => {
  const { section } = await openPrototypeOntology(page);

  const subsidiary = section.getByRole("button", { name: /^Subsidiary v26/ });
  await subsidiary.focus();

  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("v26");
  const box = await tooltip.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(640 + 16);

  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
});

test("the table shows the prototype's example ontology by parent version", async ({
  page,
}) => {
  const { parentName: x, section } = await openPrototypeOntology(page);

  await section.getByRole("button", { name: "By parent version" }).click();

  await expect(
    section.getByRole("button", { name: new RegExp(`^${x} v3, extended by`) }),
  ).toHaveAttribute(
    "aria-label",
    `${x} v3, extended by 4 types: Charity, Form 8-K Issuer, Sole Trader, Subsidiary`,
  );
  await expect(
    section.getByRole("button", { name: new RegExp(`^${x} v2, extended by`) }),
  ).toHaveAttribute(
    "aria-label",
    `${x} v2, extended by 5 types: Charity, Partnership, Public Company, Sole Trader, Subsidiary`,
  );

  await section
    .getByRole("button", { name: new RegExp(`^${x} v1, extended by`) })
    .click();
  const v1 = section.getByRole("group", { name: `Types that extend ${x} v1` });
  await expect(
    v1.getByRole("button", {
      name: `Open Subsidiary v8, the highest version that extends ${x} v1`,
    }),
  ).toBeVisible();
  await expect(
    v1.getByRole("button", {
      name: `Open Public Company v6, the highest version that extends ${x} v1`,
    }),
  ).toBeVisible();
});

test("the table warns that types may be missing when a query reaches the row limit", async ({
  page,
}) => {
  const { section } = await openPrototypeOntology(page, { cursor: true });

  await expect(section).toContainText(
    "Some types or versions may be missing from this table.",
  );
  await expect(
    section.getByRole("button", { name: /^Subsidiary v26/ }),
  ).toBeVisible();
});

test("the section says so when the queries fail", async ({ page }) => {
  const { section } = await openPrototypeOntology(page, { fail: true });

  await expect(section).toContainText(
    "Couldn't load these types. Reload the page to try again.",
  );
});
