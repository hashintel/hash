import { apiGraphQLEndpoint } from "@local/hash-isomorphic-utils/environment";
import { productionCrunchbaseCompanyId } from "@local/hash-isomorphic-utils/production-crunchbase-company-id";
import { sleep } from "@local/hash-isomorphic-utils/sleep";
import { EntityTypeRootType, Subgraph } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { entityTypeSelectorLocator } from "./browser-plugin/actions";
import { expect, test } from "./browser-plugin/fixtures";
import { loginUsingTempForm } from "./shared/login-using-temp-form";

test.skip(() => process.env.INCLUDE_COST_INCURRING_TESTS !== "true");

/**
 * This query will fetch a type from the production https://hash.ai instance, with the intent that it is loaded
 * as an 'external' type, i.e. one not owned by the requesting instance. This means the Graph API will automatically
 * fetch and load all its dependencies into the database (also as external types), thus making for an easy way
 * of loading a graph of types for testing.
 *
 * This depends on both the Node API and the Graph API treating https://hash.ai as an external instance host –
 * this requires ensuring:
 * 1. When the Graph API is run, HASH_GRAPH_ALLOWED_URL_DOMAIN_PATTERN does not include https://hash.ai
 * 2. When the Node API is run, SELF_HOSTED_HASH=true is set (otherwise https://hash.ai will be treated as internal)
 *
 * For remote testing:
 * - test.yml handles starting the Graph API and Node API with these environment variables
 *
 * For local testing:
 * - if working with a fresh instance, run the Graph API and Node API _without_ the above environment variable changes
 * - then kill and restart both with the changes
 * - then run the test
 *
 * Once the type has been loaded once, this query will simply return the type rather than making any db changes.
 */
const loadExternalTypeQuery = /* GraphQL */ `
  query getEntityType($entityTypeId: VersionedUrl!) {
    getEntityType(
      entityTypeId: $entityTypeId
      constrainsLinksOn: { outgoing: 0 }
      constrainsValuesOn: { outgoing: 0 }
      constrainsPropertiesOn: { outgoing: 0 }
      constrainsLinkDestinationsOn: { outgoing: 0 }
      inheritsFrom: { outgoing: 0 }
    ) {
      roots
    }
  }
`;

test.beforeAll(async ({ context, page }) => {
  /**
   * Use a different user to the one in browser-plugin.spec.ts to avoid clashes between configurations
   * @todo enable wiping the db between tests
   */
  await loginUsingTempForm({
    page,
    userEmail: "bob@example.com",
    userPassword: "password",
  });

  const getTypeResponse = await context.request.post(apiGraphQLEndpoint, {
    data: {
      query: loadExternalTypeQuery,
      variables: {
        entityTypeId: productionCrunchbaseCompanyId,
      },
    },
  });

  const response = (await getTypeResponse.json()) as {
    data: { getEntityType: Pick<Subgraph<EntityTypeRootType>, "roots"> };
  };

  expect(response.data.getEntityType.roots[0]?.baseId).toBe(
    extractBaseUrl(productionCrunchbaseCompanyId),
  );
});

test.use({
  /** avoid basic bot detection */
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
});

test("user can configure and use automatic inference to create entities from a webpage", async ({
  page,
  extensionId,
}) => {
  test.setTimeout(1000 * 15); // 30 minutes

  /**
   * Use a different user to the one in browser-plugin.spec.ts to avoid clashes between configurations
   * @todo enable wiping the db between tests
   */
  await loginUsingTempForm({
    page,
    userEmail: "bob@example.com",
    userPassword: "password",
  });

  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  // Choose an entity type from the entity type selector
  await page.click("text=Automated");
  await page.click("text=Select type");

  // Set the domain to crunchbase.com
  await page.click("[placeholder='On any site']");
  await page.keyboard.type("crunchbase.com");
  await page.keyboard.press("Enter");

  // Select the Crunchbase Company type, which will automatically load all its linked types
  await page.click(entityTypeSelectorLocator);
  await page.keyboard.type("crunchbase company");
  await sleep(500);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");

  // Enable automatic inference config, and confirm the configuration
  await page.click("text=Disabled", { timeout: 10_000 });
  await expect(page.locator("text=Enabled")).toBeVisible();
  await expect(page.locator("[value='Crunchbase Company']")).toBeVisible();
  await expect(page.locator("[value='Crunchbase Person']")).toBeVisible();
  await expect(page.locator("text='crunchbase.com'").first()).toBeVisible();

  // visit a crunchbase.com page to trigger the automatic inference
  await page.goto("https://www.crunchbase.com/organization/openai");
  const crunchbasePageTitle = await page.title();
  await sleep(2_000);

  // reload the browser popup to check the job has started
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.click("text=Log");

  await expect(page.locator(`text=${crunchbasePageTitle}`)).toBeVisible();

  // wait to check that the job hasn't immediately failed
  await sleep(20_000);
  await expect(page.locator("[title='Job in progress...']")).toBeVisible();

  await page.click(`text=${crunchbasePageTitle}`);

  // Check that some expected entities are inferred
  await expect(page.locator("text='OpenAI'")).toBeVisible();
  await expect(page.locator("text='Y Combinator'")).toBeVisible();
});
