/**
 * Seeds a demo dashboard into the existing `example-org` web, built on top of
 * the CRM dataset created by `seed-crm-data.ts`.
 *
 * Unlike the previous hardcoded demo items, the seeded dashboard items are
 * real `DashboardItem` entities configured exactly as the AI flow would
 * configure them: each carries a structural query and a Python script, and
 * their chart data is computed server-side through the analysis gateway
 * (graph query → E2B Python sandbox → cached artifact) when the dashboard is
 * viewed.
 *
 * Run with (graph + API must be running and migrated, and CRM data seeded):
 *
 *   yarn workspace @apps/hash-api dev:seed-crm-data
 *   yarn workspace @apps/hash-api dev:seed-dashboard-demo
 *
 * The script is idempotent: existing demo items are synchronized with the
 * definitions below, while missing items are created.
 */

import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { getMachineIdByIdentifier } from "@local/hash-backend-utils/machine-actors";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import { createTemporalClient } from "@local/hash-backend-utils/temporal";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { outgoingHopEdges } from "@local/hash-isomorphic-utils/dashboard-types";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolDataTypes,
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { generateTypeBaseUrl } from "@local/hash-isomorphic-utils/ontology-types";

import {
  createEntity,
  updateEntity,
} from "../graph/knowledge/primitive/entity";
import { createLinkEntity } from "../graph/knowledge/primitive/link-entity";
import { getOrgByShortname } from "../graph/knowledge/system-types/org";
import { getUser } from "../graph/knowledge/system-types/user";
import { logger } from "../logger";

import type { ImpureGraphContext } from "../graph/context-types";
import type {
  BaseUrl,
  PropertyPatchOperation,
  PropertyValueWithMetadata,
  PropertyWithMetadata,
  ProvidedEntityEditionProvenance,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type {
  ChartConfig,
  ChartType,
  GridPosition,
} from "@local/hash-isomorphic-utils/dashboard-types";

const DASHBOARD_NAME = "Sales Overview (Demo)";

const objectDataTypeId =
  "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1" as VersionedUrl;

/**
 * The CRM types are created by `seed-crm-data.ts` in the `@h` web under
 * `crm-…` slugs (see `crmTypeBaseUrl` there). Their base URLs are
 * deterministic, so we can reference them here without querying.
 */
const crmEntityTypeBaseUrl = (title: string) =>
  generateTypeBaseUrl({
    domain: "https://hash.ai",
    kind: "entity-type",
    title: `CRM ${title}`,
    webShortname: "h",
  });

const crmDealBaseUrl = crmEntityTypeBaseUrl("Deal");
const crmAccountBaseUrl = crmEntityTypeBaseUrl("Account");
/** Link entity types share the CRM slug convention (see `makeLinkType`). */
const crmForAccountLinkBaseUrl = crmEntityTypeBaseUrl("For Account");

/** A structural query matching all non-archived entities of a CRM type. */
const queryForType = (entityTypeBaseUrl: string) => ({
  all: [
    {
      equal: [{ path: ["type", "baseUrl"] }, { parameter: entityTypeBaseUrl }],
    },
  ],
});

type DemoItem = {
  name: string;
  goal: string;
  chartType: ChartType;
  structuralQuery: Record<string, unknown>;
  /**
   * Python executed in the E2B sandbox. `DATA_FILE_PATH` is injected by the
   * runner and points at `{"entities": [...], "entityTypes": [...]}` where
   * entity properties are keyed by property *title* (see simplified-graph).
   * The script must print a JSON array of chart data rows to stdout.
   */
  pythonScript: string;
  chartConfig: ChartConfig;
  gridPosition: Omit<GridPosition, "i">;
};

const demoItems: DemoItem[] = [
  {
    name: "Open pipeline by forecast category",
    goal: "Show the total value of open deals grouped by forecast category",
    chartType: "bar",
    structuralQuery: queryForType(crmDealBaseUrl),
    pythonScript: `import json
from collections import defaultdict

with open(DATA_FILE_PATH) as f:
    data = json.load(f)

totals = defaultdict(float)
counts = defaultdict(int)

for entity in data["entities"]:
    props = entity["properties"]
    if props.get("Is Closed"):
        continue
    category = props.get("Forecast Category")
    amount = props.get("Amount")
    if not category or not isinstance(amount, (int, float)):
        continue
    totals[category] += amount
    counts[category] += 1

# Keep the conventional forecast ordering rather than alphabetical.
order = ["Pipeline", "Best Case", "Commit", "Closed", "Omitted"]
result = [
    {
        "category": category,
        "totalValue": round(totals[category]),
        "dealCount": counts[category],
    }
    for category in order
    if category in totals
]

print(json.dumps(result))
`,
    chartConfig: {
      categoryKey: "category",
      series: [{ type: "bar", name: "Open deal value", dataKey: "totalValue" }],
      xAxisLabel: "Forecast category",
      yAxisLabel: "Value (USD)",
      showLegend: false,
      showGrid: true,
      showTooltip: true,
    },
    gridPosition: { x: 0, y: 0, w: 6, h: 8 },
  },
  {
    name: "Accounts by industry",
    goal: "Show how our accounts are distributed across industries",
    chartType: "bar",
    structuralQuery: queryForType(crmAccountBaseUrl),
    pythonScript: `import json
from collections import Counter

with open(DATA_FILE_PATH) as f:
    data = json.load(f)

counts = Counter()
for entity in data["entities"]:
    industry = entity["properties"].get("Industry")
    if industry:
        counts[industry] += 1

result = [
    {"industry": industry, "accountCount": count}
    for industry, count in counts.most_common()
]

print(json.dumps(result))
`,
    chartConfig: {
      categoryKey: "industry",
      series: [{ type: "bar", name: "Accounts", dataKey: "accountCount" }],
      xAxisLabel: "Industry",
      yAxisLabel: "Accounts",
      showLegend: false,
      showGrid: true,
      showTooltip: true,
    },
    gridPosition: { x: 6, y: 0, w: 6, h: 8 },
  },
  {
    name: "Deal value closing by month",
    goal: "Show the total value of deals expected to close each month",
    chartType: "line",
    structuralQuery: queryForType(crmDealBaseUrl),
    pythonScript: `import json
from collections import defaultdict

with open(DATA_FILE_PATH) as f:
    data = json.load(f)

totals = defaultdict(float)
for entity in data["entities"]:
    props = entity["properties"]
    close_date = props.get("Close Date")
    amount = props.get("Amount")
    if not close_date or not isinstance(amount, (int, float)):
        continue
    month = str(close_date)[:7]  # YYYY-MM
    totals[month] += amount

result = [
    {"month": month, "totalValue": round(totals[month])}
    for month in sorted(totals)
]

print(json.dumps(result))
`,
    chartConfig: {
      categoryKey: "month",
      series: [
        {
          type: "line",
          name: "Deal value closing",
          dataKey: "totalValue",
          smooth: true,
        },
      ],
      xAxisLabel: "Close month",
      yAxisLabel: "Value (USD)",
      showLegend: false,
      showGrid: true,
      showTooltip: true,
    },
    gridPosition: { x: 0, y: 8, w: 12, h: 8 },
  },
  {
    /*
     * Demonstrates traversal paths: the query matches deals and pulls in the
     * accounts they link to (via "For Account"), so the script can group deal
     * value by a property that lives on the *account*, not the deal.
     */
    name: "Open pipeline by account industry",
    goal: "Show the total value of open deals grouped by the industry of the account they are with",
    chartType: "bar",
    structuralQuery: {
      filter: queryForType(crmDealBaseUrl),
      traversalPaths: [
        {
          edges: outgoingHopEdges,
          label: "For Account → Account",
          hops: [
            {
              direction: "outgoing",
              linkTypeBaseUrl: crmForAccountLinkBaseUrl,
              entityTypeBaseUrl: crmAccountBaseUrl,
            },
          ],
        },
      ],
    },
    pythonScript: `import json
from collections import defaultdict

with open(DATA_FILE_PATH) as f:
    data = json.load(f)

entities = data["entities"]

# Accounts arrive via the traversal hop; index their industry by entityId.
industry_by_entity_id = {
    entity["entityId"]: entity["properties"].get("Industry")
    for entity in entities
    if "Account" in entity["entityTypes"]
}

totals = defaultdict(float)
for entity in entities:
    if "Deal" not in entity["entityTypes"]:
        continue
    props = entity["properties"]
    if props.get("Is Closed"):
        continue
    amount = props.get("Amount")
    if not isinstance(amount, (int, float)):
        continue
    industry = None
    for link in entity.get("links", []):
        if "For Account" in link["entityTypes"]:
            industry = industry_by_entity_id.get(link["targetEntityId"])
            break
    totals[industry or "Unknown"] += amount

result = [
    {"industry": industry, "openDealValue": round(total)}
    for industry, total in sorted(totals.items(), key=lambda kv: -kv[1])
]

print(json.dumps(result))
`,
    chartConfig: {
      categoryKey: "industry",
      series: [
        { type: "bar", name: "Open deal value", dataKey: "openDealValue" },
      ],
      xAxisLabel: "Account industry",
      yAxisLabel: "Value (USD)",
      showLegend: false,
      showGrid: true,
      showTooltip: true,
    },
    gridPosition: { x: 0, y: 16, w: 12, h: 8 },
  },
];

const textValue = (value: string): PropertyWithMetadata => ({
  value,
  metadata: { dataTypeId: blockProtocolDataTypes.text.dataTypeId },
});

const objectValue = (value: unknown): PropertyWithMetadata => ({
  value: value as PropertyValueWithMetadata["value"],
  metadata: { dataTypeId: objectDataTypeId },
});

const propertiesForDemoItem = (item: DemoItem, index: number) => ({
  [blockProtocolPropertyTypes.name.propertyTypeBaseUrl]: textValue(item.name),
  [systemPropertyTypes.goal.propertyTypeBaseUrl]: textValue(item.goal),
  [systemPropertyTypes.configurationStatus.propertyTypeBaseUrl]:
    textValue("ready"),
  [systemPropertyTypes.chartType.propertyTypeBaseUrl]: textValue(
    item.chartType,
  ),
  [systemPropertyTypes.structuralQuery.propertyTypeBaseUrl]: objectValue(
    item.structuralQuery,
  ),
  [systemPropertyTypes.pythonScript.propertyTypeBaseUrl]: textValue(
    item.pythonScript,
  ),
  [systemPropertyTypes.chartConfiguration.propertyTypeBaseUrl]: objectValue(
    item.chartConfig,
  ),
  [systemPropertyTypes.gridPosition.propertyTypeBaseUrl]: objectValue({
    i: `demo-item-${index + 1}`,
    ...item.gridPosition,
  }),
});

/**
 * Archive dashboard items in the web that are only partially configured —
 * left behind by abandoned or failed AI configuration flows. Also archives
 * the "Has" links pointing at them so dashboards don't keep dangling links.
 */
const cleanUpBrokenItems = async (
  context: ImpureGraphContext<false, true>,
  authentication: AuthenticationContext,
  webId: WebId,
) => {
  const { entities: items } = await queryEntities(
    { graphApi: context.graphApi },
    authentication,
    {
      filter: {
        all: [
          {
            equal: [
              { path: ["type", "baseUrl"] },
              {
                parameter: systemEntityTypes.dashboardItem.entityTypeBaseUrl,
              },
            ],
          },
          { equal: [{ path: ["webId"] }, { parameter: webId }] },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  );

  const brokenItems = items.filter((item) => {
    const props = item.properties as Record<string, unknown>;
    const configurationStatus =
      props[systemPropertyTypes.configurationStatus.propertyTypeBaseUrl];
    /**
     * A pending item may be an intentionally blank card saved by a user.
     * Only clean up items whose configuration process progressed but left an
     * incomplete result.
     */
    if (configurationStatus === "pending") {
      return false;
    }
    const isConfigured =
      props[systemPropertyTypes.structuralQuery.propertyTypeBaseUrl] &&
      props[systemPropertyTypes.pythonScript.propertyTypeBaseUrl] &&
      props[systemPropertyTypes.chartConfiguration.propertyTypeBaseUrl] &&
      configurationStatus === "ready";
    return !isConfigured;
  });

  if (brokenItems.length === 0) {
    return 0;
  }

  for (const item of brokenItems) {
    const itemEntityId = item.metadata.recordId.entityId;
    logger.info(`Archiving broken dashboard item ${itemEntityId}…`);

    const { entities: links } = await queryEntities(
      { graphApi: context.graphApi },
      authentication,
      {
        filter: {
          all: [
            {
              equal: [
                { path: ["type", "baseUrl"] },
                {
                  parameter: systemLinkEntityTypes.has.linkEntityTypeBaseUrl,
                },
              ],
            },
            {
              equal: [
                { path: ["rightEntity", "uuid"] },
                { parameter: extractEntityUuidFromEntityId(itemEntityId) },
              ],
            },
            { equal: [{ path: ["webId"] }, { parameter: webId }] },
            { equal: [{ path: ["archived"] }, { parameter: false }] },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    );

    for (const link of links) {
      await updateEntity(context, authentication, {
        entity: link,
        archived: true,
      });
    }

    await updateEntity(context, authentication, {
      entity: item,
      archived: true,
    });
  }

  return brokenItems.length;
};

const seedDashboardDemo = async () => {
  const graphApi = createGraphClient(logger, {
    host: getRequiredEnv("HASH_GRAPH_HTTP_HOST"),
    port: Number.parseInt(getRequiredEnv("HASH_GRAPH_HTTP_PORT"), 10),
  });

  const provenance: ProvidedEntityEditionProvenance = {
    actorType: "user",
    origin: { type: "api" },
  };
  const temporalClient = await createTemporalClient();
  const context = { graphApi, provenance, temporalClient };

  const hashBotActorId = await getMachineIdByIdentifier(
    context,
    { actorId: publicUserAccountId },
    { identifier: "h" },
  );
  if (!hashBotActorId) {
    throw new Error("Failed to get hash bot machine actor");
  }
  const botAuthentication = { actorId: hashBotActorId };

  /*
   * Entities are created in the existing `example-org` web as the org owner
   * (`alice`), so that all members of that org can see them — mirroring
   * `seed-crm-data.ts`.
   */
  const exampleOrg = await getOrgByShortname(context, botAuthentication, {
    shortname: "example-org",
  });
  if (!exampleOrg) {
    throw new Error(
      'Org "example-org" not found — run the dev environment (which seeds users and the example org) before seeding the demo dashboard.',
    );
  }

  const alice = await getUser(context, botAuthentication, {
    shortname: "alice",
  });
  if (!alice) {
    throw new Error(
      'Seeded user "alice" not found — run the dev environment before seeding the demo dashboard.',
    );
  }

  const webId = exampleOrg.webId;
  const authentication = { actorId: alice.accountId };

  /* Remove partially-configured items left behind by failed config flows. */
  const cleanedUp = await cleanUpBrokenItems(context, authentication, webId);
  if (cleanedUp > 0) {
    logger.info(`Archived ${cleanedUp} broken dashboard item(s).`);
  }

  /* Verify the CRM dataset the widgets query is present. */
  const { entities: crmDeals } = await queryEntities(
    { graphApi },
    authentication,
    {
      filter: queryForType(crmDealBaseUrl),
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
      limit: 1,
    },
  );
  if (crmDeals.length === 0) {
    throw new Error(
      "No CRM deals found — run `yarn workspace @apps/hash-api dev:seed-crm-data` before seeding the demo dashboard.",
    );
  }

  /*
   * Idempotency: reuse the demo dashboard if it already exists, synchronize
   * existing demo items by name, and create any missing items.
   */
  const { entities: existingDashboards } = await queryEntities(
    { graphApi },
    authentication,
    {
      filter: {
        all: [
          {
            equal: [
              { path: ["type", "baseUrl"] },
              { parameter: systemEntityTypes.dashboard.entityTypeBaseUrl },
            ],
          },
          {
            equal: [
              {
                path: [
                  "properties",
                  blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
                ],
              },
              { parameter: DASHBOARD_NAME },
            ],
          },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
      limit: 1,
    },
  );

  let dashboard = existingDashboards[0];
  if (dashboard) {
    logger.info(`Demo dashboard "${DASHBOARD_NAME}" already exists.`);
  } else {
    logger.info(`Creating demo dashboard "${DASHBOARD_NAME}"…`);

    dashboard = await createEntity(context, authentication, {
      webId,
      entityTypeIds: [systemEntityTypes.dashboard.entityTypeId],
      properties: {
        value: {
          [blockProtocolPropertyTypes.name.propertyTypeBaseUrl]:
            textValue(DASHBOARD_NAME),
          [blockProtocolPropertyTypes.description.propertyTypeBaseUrl]:
            textValue(
              "Demo dashboard over the seeded CRM dataset. Each widget's data is computed server-side from its structural query and Python script.",
            ),
        },
      },
    });
  }

  const { entities: existingItems } = await queryEntities(
    { graphApi },
    authentication,
    {
      filter: {
        all: [
          {
            equal: [
              { path: ["type", "baseUrl"] },
              { parameter: systemEntityTypes.dashboardItem.entityTypeBaseUrl },
            ],
          },
          { equal: [{ path: ["webId"] }, { parameter: webId }] },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  );
  const existingItemsByName = new Map(
    existingItems.map((item) => [
      item.properties[
        blockProtocolPropertyTypes.name.propertyTypeBaseUrl
      ] as string,
      item,
    ]),
  );

  let createdCount = 0;
  let updatedCount = 0;
  for (const [index, item] of demoItems.entries()) {
    const properties = propertiesForDemoItem(item, index);
    const existingItem = existingItemsByName.get(item.name);

    if (existingItem) {
      logger.info(`Synchronizing dashboard item "${item.name}"…`);
      await updateEntity(context, authentication, {
        entity: existingItem,
        propertyPatches: Object.entries(properties)
          /**
           * Preserve any layout changes made interactively. The taller
           * seeded default applies when creating items, not when re-seeding
           * an existing dashboard.
           */
          .filter(
            ([propertyBaseUrl]) =>
              propertyBaseUrl !==
              systemPropertyTypes.gridPosition.propertyTypeBaseUrl,
          )
          .map(
            ([propertyBaseUrl, property]) =>
              ({
                op: "add",
                path: [propertyBaseUrl as BaseUrl],
                property,
              }) satisfies PropertyPatchOperation,
          ),
      });
      updatedCount += 1;
      continue;
    }
    logger.info(`Creating dashboard item "${item.name}"…`);
    createdCount += 1;

    const itemEntity = await createEntity(context, authentication, {
      webId,
      entityTypeIds: [systemEntityTypes.dashboardItem.entityTypeId],
      properties: {
        value: properties,
      },
    });

    await createLinkEntity(context, authentication, {
      webId,
      entityTypeIds: [systemLinkEntityTypes.has.linkEntityTypeId],
      properties: { value: {} },
      linkData: {
        leftEntityId: dashboard.metadata.recordId.entityId,
        rightEntityId: itemEntity.metadata.recordId.entityId,
      },
    });
  }

  logger.info(
    `✅ Demo dashboard seeded (${createdCount} new item(s), ${updatedCount} synchronized). Open /dashboards in the app to view it.`,
  );
};

await seedDashboardDemo();

// The Temporal client connection keeps the event loop alive — exit explicitly.
process.exit(0);
