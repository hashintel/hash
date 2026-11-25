/**
 * Seeds a web of a deployed HASH, such as staging, with two company outreach flows and what they need: a Company entity
 * type and its properties, and the companies in `flow-company-outreach/companies.json`. Both flows split companies by
 * whether their contact uses a personal email address, and draft a first-touch email for the organisations (from a
 * brief of their details) and a personal note for the people.
 *
 *  - "First-touch email for picked companies" writes to the companies picked in its run form.
 *  - "Company first-touch email" finds the companies never contacted and counts each side. It writes to the biggest
 *    organisations, as many as its run form asks for, and to the first 20 people. If the brief flags a company of 500
 *    or more staff, its "Escalate" path drafts a note to the account lead.
 *
 * It only uses the GraphQL API, as the signed-in user, so it needs no access to the graph. Sign in to the deployment in
 * a browser, copy the value of its `ory_kratos_session` cookie, and enter it without echoing it or saving it in your
 * shell history. It's kept in an unexported shell variable and passed only to this command, so other programs started
 * from the shell don't inherit it:
 *
 *   read -s HASH_SESSION_COOKIE
 *   HASH_SESSION_COOKIE=$HASH_SESSION_COOKIE HASH_API_URL=https://api.stage.hash.ai yarn workspace @apps/hash-api seed-flow-company-outreach
 *
 * Sign out of the deployment in the browser afterwards, which ends the session the cookie belongs to, and
 * `unset HASH_SESSION_COOKIE`.
 *
 * Options:
 *  - `HASH_API_URL`: the API to seed. Required: there is no default, and production is refused.
 *  - `--dry-run`: print what would be created, and make no requests at all. Needs neither variable.
 *  - `--web-id <uuid>`: an org's web to seed instead of your own. Flows only find entities in the web they run in.
 *  - `--only <names>`: seed only the flows named, separated by commas. The types and companies are seeded either way.
 *  - `--replace-flow`: replace the definitions of flows the web already has, discarding edits made to them.
 *  - `--pause-ms <ms>`: how long to wait after each thing created, 2500 by default and at least 1000.
 *  - `--data <file>`: a JSON file of companies to seed instead of the committed ones, in the same shape.
 *
 * Types, companies (by name) and flows (by name) are each only created if the web doesn't have them yet, so the script
 * can be run again, for example after it stopped part way. It never starts a run or adds a schedule.
 *
 * Why it's slow: on 13 Nov 2026 an earlier seed script made about 100 writes to staging in under a minute, six at a
 * time. The graph starts an embeddings workflow on the AI worker for every entity and type created, the jobs arrived
 * together, and the worker lost its connection to the graph. Whether load caused that or only exposed a network fault
 * was never settled, so this script avoids bursts: it makes one write at a time, waits after each, and stops at the
 * first refused request without retrying.
 */

/* eslint-disable no-console -- A command-line script: its output is for the person running it. */

import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { typedActionDefinitions as actions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { isIsoDate } from "@local/hash-isomorphic-utils/flows/datetime";
import {
  constant,
  defineFlow,
  flowInput,
} from "@local/hash-isomorphic-utils/flows/define-flow";
import { maxDraftMessageEntities } from "@local/hash-isomorphic-utils/flows/limits";
import { assertValidFlowDefinition } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";
import {
  currentTimeInstantTemporalAxes,
  fullTransactionTimeAxis,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolDataTypes,
  blockProtocolPropertyTypes,
  systemDataTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { BaseUrl } from "@blockprotocol/type-system";
import type { FilterCondition } from "@local/hash-isomorphic-utils/flows/filter-condition";
import type {
  EntityQuery,
  FlowDefinition,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

const pickedCompaniesFlowName = "First-touch email for picked companies";
const neverContactedFlowName = "Company first-touch email";
const flowNames = [pickedCompaniesFlowName, neverContactedFlowName];

/** Domains of personal email addresses: a contact at one is a person, not an organisation. */
const personalEmailDomains = [
  "gmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
];

const defaultPauseMs = 2500;
const minPauseMs = 1000;

/** Hosts of the production deployment, which this script refuses to write to. */
const productionHosts = new Set(["hash.ai", "app.hash.ai", "api.hash.ai"]);

const args = process.argv.slice(2);

const getFlagValue = (flag: string) => {
  const index = args.indexOf(flag);

  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];

  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} needs a value.`);
  }

  return value;
};

const valueFlags = ["--web-id", "--pause-ms", "--data", "--only"];
const booleanFlags = ["--dry-run", "--replace-flow"];

type Company = {
  name: string;
  industry: string;
  size: number;
  description: string;
  contactName: string;
  contactEmail: string;
  lastContacted?: string;
};

const textFields = [
  "name",
  "industry",
  "description",
  "contactName",
  "contactEmail",
] as const;

/** Reads and checks a companies file, so a mistake in a private list stops the script before it writes anything. */
const readCompanies = (file: string): Company[] => {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${file} must hold a non-empty array of companies.`);
  }

  const names = new Set<string>();

  return parsed.map((entry: unknown, index): Company => {
    const where = `Company ${index + 1} in ${file}`;

    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`${where} must be an object.`);
    }

    const record = entry as Record<string, unknown>;

    for (const field of textFields) {
      const value = record[field];

      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`${where} needs a "${field}" text.`);
      }
    }

    if (
      typeof record.size !== "number" ||
      !Number.isInteger(record.size) ||
      record.size < 0
    ) {
      throw new Error(`${where} needs a "size": a whole number, 0 or more.`);
    }

    if (
      record.lastContacted !== undefined &&
      (typeof record.lastContacted !== "string" ||
        !isIsoDate(record.lastContacted))
    ) {
      throw new Error(
        `${where} has a "lastContacted" that isn't a date (YYYY-MM-DD).`,
      );
    }

    const company = record as Company;

    if (names.has(company.name)) {
      throw new Error(`${where} has the same name as another: ${company.name}`);
    }

    names.add(company.name);

    return company;
  });
};

const dataTypeIds = {
  text: blockProtocolDataTypes.text.dataTypeId,
  number: blockProtocolDataTypes.number.dataTypeId,
  date: systemDataTypes.date.dataTypeId,
  email: systemDataTypes.email.dataTypeId,
} as const;

/**
 * The Company type's own properties. Contact Email has the Email data type: Filter list's conditions offer a property
 * of it as text, as they do any string data type that isn't a date.
 */
const propertyTypeDefinitions = {
  industry: {
    title: "Industry",
    description: "The industry a company works in.",
    dataTypeId: dataTypeIds.text,
  },
  size: {
    title: "Size",
    description: "How many people a company employs.",
    dataTypeId: dataTypeIds.number,
  },
  contactName: {
    title: "Contact Name",
    description: "The person to write to at a company.",
    dataTypeId: dataTypeIds.text,
  },
  contactEmail: {
    title: "Contact Email",
    description: "The email address of the person to write to at a company.",
    dataTypeId: dataTypeIds.email,
  },
  lastContacted: {
    title: "Last Contacted",
    description: "When we last wrote to a company. Empty if we never have.",
    dataTypeId: dataTypeIds.date,
  },
} as const;

type PropertyKey = keyof typeof propertyTypeDefinitions;

const companyTypeTitle = "Company";

const nameBaseUrl = blockProtocolPropertyTypes.name.propertyTypeBaseUrl;
const descriptionBaseUrl =
  blockProtocolPropertyTypes.description.propertyTypeBaseUrl;

/** The types and properties the flows read, by base URL. */
type FlowTypeUrls = {
  company: BaseUrl;
  contactEmail: BaseUrl;
  lastContacted: BaseUrl;
  size: BaseUrl;
};

type RunAfter = NonNullable<StepDefinition<string>["runAfter"]>;

/**
 * Sets the steps each step runs after, which the editor draws as the lines between them: `defineFlow` only sets the
 * outputs a step reads. Then validates the definition, so a mistake stops the script before it writes anything.
 */
const connectSteps = (
  flowDefinition: FlowDefinition,
  runAfter: Record<string, RunAfter>,
): FlowDefinition =>
  assertValidFlowDefinition({
    ...flowDefinition,
    steps: flowDefinition.steps.map((flowStep) =>
      runAfter[flowStep.stepId]
        ? { ...flowStep, runAfter: runAfter[flowStep.stepId] }
        : flowStep,
    ),
  });

/** Whether a company's contact uses a personal email address, as the condition rows save it. */
const isPersonalEmail = (urls: FlowTypeUrls): FilterCondition => ({
  kind: "any",
  conditions: personalEmailDomains.map((domain) => ({
    kind: "condition",
    subject: {
      kind: "entityProperty",
      propertyTypeBaseUrl: urls.contactEmail,
      payloadKind: "Text",
    },
    operator: "endsWith",
    value: { kind: "Text", value: domain },
  })),
});

const splitDescription = "Organisation or person?";

const briefInstructions =
  "Write a short brief for someone about to write a first-touch email to each company given. For each one, say who the contact is, what the company does, its industry and size, and when we last contacted it, or that we never have. Use a few bullet points per company. This is notes for the writer, not the email itself.";

const emailInstructions =
  "Write a friendly first-touch email from HASH to the contact at the company in the brief, under 150 words. Mention what the company does, and suggest a short call. If the brief covers more than one company, write one email that suits each of them, with [Company] and [First name] placeholders.";

const personalNoteInstructions =
  "Write a short, warm note from HASH to the person given, under 100 words. They use a personal email address, so write to them as an individual, not as a company, and avoid corporate language. If several people are given, write one note with a [First name] placeholder.";

/** Drafts emails to the companies picked in the run form. */
const buildPickedCompaniesFlow = (urls: FlowTypeUrls): FlowDefinition => {
  const { flowDefinition } = defineFlow(
    {
      flowDefinitionId: crypto.randomUUID(),
      name: pickedCompaniesFlowName,
      description:
        "Split the companies picked by whether their contact is a person or an organisation, and draft a first-touch email to each",
      inputs: {
        companies: flowInput("EntityId", {
          array: true,
          label: "Companies",
          description: "The companies to write to",
        }),
      },
    },
    ({ inputs, step }) => {
      const split = step("splitContacts", actions.filterList, {
        description: splitDescription,
        inputs: {
          items: inputs.companies,
          condition: constant("FilterCondition", isPersonalEmail(urls)),
        },
      });

      const details = step("pickDetails", actions.draftMessage, {
        description: "Pick out the details",
        inputs: {
          instructions: constant("Text", briefInstructions),
          entities: split.outputs.nonMatching,
        },
      });

      const email = step("writeEmail", actions.draftMessage, {
        description: "Write the email",
        inputs: {
          instructions: constant("Text", emailInstructions),
          context: details.outputs.body,
        },
      });

      const note = step("personalNote", actions.draftMessage, {
        description: "Personal note",
        inputs: {
          instructions: constant("Text", personalNoteInstructions),
          entities: split.outputs.matching,
        },
      });

      return {
        outputs: {
          "Email subject": email.outputs.subject,
          "Email body": email.outputs.body,
          "Personal note subject": note.outputs.subject,
          "Personal note body": note.outputs.body,
        },
      };
    },
  );

  return connectSteps(flowDefinition, {
    pickDetails: [{ stepId: "splitContacts" }],
    writeEmail: [{ stepId: "pickDetails" }],
    personalNote: [{ stepId: "splitContacts" }],
  });
};

/**
 * Finds the companies never contacted and drafts emails to the biggest organisations among them, flagging a large one
 * for the account lead, and a note to the people.
 */
const buildNeverContactedFlow = (urls: FlowTypeUrls): FlowDefinition => {
  /* In the shape Find entities' query builder writes: `{ all: [types, conditions] }`. */
  const neverContacted: EntityQuery = {
    filter: {
      all: [
        {
          any: [
            {
              equal: [
                { path: ["type", "baseUrl"] },
                { parameter: urls.company },
              ],
            },
          ],
        },
        {
          all: [
            {
              not: {
                exists: { path: ["properties", urls.lastContacted] },
              },
            },
          ],
        },
      ],
    },
  };

  const startsWithLarge: FilterCondition = {
    kind: "all",
    conditions: [
      {
        kind: "condition",
        subject: { kind: "input", payloadKind: "Text" },
        operator: "startsWith",
        value: { kind: "Text", value: "LARGE" },
      },
    ],
  };

  const { flowDefinition } = defineFlow(
    {
      flowDefinitionId: crypto.randomUUID(),
      name: neverContactedFlowName,
      description:
        "Find the companies we've never contacted, and draft a first-touch email to the biggest organisations and a note to the people",
      inputs: {
        howMany: flowInput("Number", {
          label: "How many organisations?",
          description: "How many of the biggest organisations to write to",
        }),
      },
    },
    ({ inputs, step }) => {
      const found = step("findNeverContacted", actions.queryEntities, {
        description: "Companies never contacted",
        inputs: { query: constant("EntityQuery", neverContacted) },
      });

      const split = step("splitContacts", actions.filterList, {
        description: splitDescription,
        inputs: {
          items: found.outputs.entities,
          condition: constant("FilterCondition", isPersonalEmail(urls)),
        },
      });

      const organisationCount = step("countOrganisations", actions.aggregate, {
        description: "Count organisations",
        inputs: {
          items: split.outputs.nonMatching,
          aggregation: constant("Aggregation", { operation: "count" }),
        },
      });

      const peopleCount = step("countPeople", actions.aggregate, {
        description: "Count people",
        inputs: {
          items: split.outputs.matching,
          aggregation: constant("Aggregation", { operation: "count" }),
        },
      });

      const biggestFirst = step("biggestFirst", actions.orderBy, {
        description: "Biggest first",
        inputs: {
          items: split.outputs.nonMatching,
          sortBy: constant("SortKey", {
            subject: {
              kind: "entityProperty",
              propertyTypeBaseUrl: urls.size,
              payloadKind: "Number",
            },
            direction: "descending",
          }),
        },
      });

      const biggest = step("keepBiggest", actions.takeFirst, {
        description: "Keep the biggest",
        inputs: { items: biggestFirst.outputs.items, count: inputs.howMany },
      });

      const details = step("pickDetails", actions.draftMessage, {
        description: "Pick out the details",
        inputs: {
          instructions: constant(
            "Text",
            `${briefInstructions} If any company given has 500 or more staff, start the subject with "LARGE:"; otherwise, don't.`,
          ),
          entities: biggest.outputs.items,
        },
      });

      step("writeEmail", actions.draftMessage, {
        description: "Write the email",
        inputs: {
          instructions: constant("Text", emailInstructions),
          context: details.outputs.body,
        },
      });

      step("anyLarge", actions.if, {
        description: "Any large company?",
        inputs: {
          value: details.outputs.subject,
          condition: constant("FilterCondition", startsWithLarge),
        },
      });

      step("noteToLead", actions.draftMessage, {
        description: "Note to the account lead",
        inputs: {
          instructions: constant(
            "Text",
            "Write a short note to our account lead about the large companies in the brief: who they are, why they're worth a careful first touch, and a request to review the first-touch email before it goes out. Under 120 words.",
          ),
          context: details.outputs.body,
        },
      });

      const firstPeople = step("keepFirstPeople", actions.takeFirst, {
        description: "Keep the first 20",
        inputs: {
          items: split.outputs.matching,
          count: constant("Number", maxDraftMessageEntities),
        },
      });

      step("personalNote", actions.draftMessage, {
        description: "Personal note",
        inputs: {
          instructions: constant("Text", personalNoteInstructions),
          entities: firstPeople.outputs.items,
        },
      });

      return {
        outputs: {
          "Organisations never contacted": organisationCount.outputs.result,
          "People never contacted": peopleCount.outputs.result,
        },
      };
    },
  );

  const withPaths = {
    ...flowDefinition,
    steps: flowDefinition.steps.map((flowStep) =>
      flowStep.stepId === "anyLarge" && flowStep.kind === "action"
        ? { ...flowStep, pathNames: { true: "Escalate" } }
        : flowStep,
    ),
  };

  return connectSteps(withPaths, {
    splitContacts: [{ stepId: "findNeverContacted" }],
    countOrganisations: [{ stepId: "splitContacts" }],
    countPeople: [{ stepId: "splitContacts" }],
    biggestFirst: [{ stepId: "splitContacts" }],
    keepBiggest: [{ stepId: "biggestFirst" }],
    pickDetails: [{ stepId: "keepBiggest" }],
    writeEmail: [{ stepId: "pickDetails" }],
    anyLarge: [{ stepId: "writeEmail" }],
    /* Only on If's Yes path, as the editor connects a step to a path. */
    noteToLead: [{ stepId: "anyLarge", outputName: "true" }],
    keepFirstPeople: [{ stepId: "splitContacts" }],
    personalNote: [{ stepId: "keepFirstPeople" }],
  });
};

/** The flows named, in the order they're seeded. */
const buildFlows = (urls: FlowTypeUrls, names: string[]) =>
  [buildPickedCompaniesFlow(urls), buildNeverContactedFlow(urls)].filter(
    ({ name }) => names.includes(name),
  );

const describeCompany = (company: Company) =>
  `${company.name} (${company.industry}, size ${company.size}, ${company.contactName} <${company.contactEmail}>, ${
    company.lastContacted
      ? `last contacted ${company.lastContacted}`
      : "never contacted"
  })`;

const printDryRun = (
  companies: Company[],
  pauseMs: number,
  names: string[],
) => {
  const placeholder = (kind: string, title: string) =>
    `https://hash.example/@you/types/${kind}/${title}/` as BaseUrl;
  const flows = buildFlows(
    {
      company: placeholder("entity-type", "company"),
      contactEmail: placeholder("property-type", "contact-email"),
      lastContacted: placeholder("property-type", "last-contacted"),
      size: placeholder("property-type", "size"),
    },
    names,
  );
  const writes =
    Object.keys(propertyTypeDefinitions).length +
    1 +
    companies.length +
    flows.length;

  console.log(
    "Dry run: no requests are made. In a web that has none of these yet, the script would create:",
  );
  console.log(
    `\n${Object.keys(propertyTypeDefinitions).length} property types, each only if the web has none of its title:`,
  );
  for (const { title, dataTypeId } of Object.values(propertyTypeDefinitions)) {
    console.log(`  - ${title} (${dataTypeId})`);
  }
  console.log(
    `\n1 entity type, "${companyTypeTitle}", with the built-in Name and Description and the properties above.`,
  );
  console.log(
    `\n${companies.length} companies, each only if the web has no company of its name:`,
  );
  for (const company of companies) {
    console.log(`  - ${describeCompany(company)}`);
  }
  for (const flow of flows) {
    console.log(
      `\nFlow "${flow.name}", only if the web has none of that name (or its definition replaced, with --replace-flow):`,
    );
    console.log(
      `  - Input: ${flow.inputs.map(({ label, name }) => label ?? name).join(", ")}`,
    );
    for (const flowStep of flow.steps) {
      const after = (flowStep.runAfter ?? []).map(({ stepId, outputName }) =>
        outputName ? `${stepId} (${outputName})` : stepId,
      );

      console.log(
        `  - ${flowStep.stepId}: ${flowStep.description}${after.length > 0 ? `, after ${after.join(", ")}` : ""}`,
      );
    }
    console.log(
      `  - Outputs: ${flow.outputs.map(({ name, stepId, outputName }) => `${name} (${stepId}.${outputName})`).join(", ")}`,
    );
  }
  console.log(
    `\nThe flow definitions passed local validation. That's at most ${writes} writes, one at a time, with a ${pauseMs} ms pause after each: about ${Math.ceil(
      (writes * pauseMs) / 1000,
    )} seconds of pauses.`,
  );
};

/** The API's URL, if it may be seeded: not production, and over HTTPS unless it's this machine. */
const getApiUrl = () => {
  const value = process.env.HASH_API_URL;

  if (!value) {
    throw new Error(
      "Set HASH_API_URL to the API to seed, e.g. https://api.stage.hash.ai. There is no default.",
    );
  }

  const url = new URL(value);
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

  if (productionHosts.has(url.hostname)) {
    throw new Error(
      `${url.hostname} is production, which this script doesn't seed.`,
    );
  }

  if (url.protocol !== "https:" && !isLoopback) {
    throw new Error(
      `HASH_API_URL must use HTTPS for a host other than this machine, so the session cookie isn't sent in the clear.`,
    );
  }

  return url.origin;
};

type OntologyType = {
  schema: { $id: string; title: string };
  metadata: { recordId: { baseUrl: BaseUrl } };
};

type SerializedEntity = {
  properties: Record<string, unknown>;
  metadata: { recordId: { entityId: string; editionId: string } };
};

type FlowSaveResult = {
  flowDefinitionEntityId: string;
  isRunnable: boolean;
  diagnostics: { severity: string; message: string }[];
};

const seed = async ({
  companies,
  pauseMs,
  webIdFlag,
  replaceFlow,
  names,
}: {
  companies: Company[];
  pauseMs: number;
  webIdFlag: string | undefined;
  replaceFlow: boolean;
  names: string[];
}) => {
  const apiUrl = getApiUrl();
  const sessionCookie = process.env.HASH_SESSION_COOKIE;

  if (!sessionCookie) {
    throw new Error(
      "Set HASH_SESSION_COOKIE to the value of the deployment's ory_kratos_session cookie: read -s HASH_SESSION_COOKIE, then run the script with HASH_SESSION_COOKIE=$HASH_SESSION_COOKIE before it.",
    );
  }

  /** Makes one request, and throws if the API refuses it. Never retries. */
  const graphql = async <T>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> => {
    const response = await fetch(`${apiUrl}/graphql`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `ory_kratos_session=${sessionCookie}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    const body = (await response.json().catch(() => undefined)) as
      | { data?: T; errors?: { message: string }[] }
      | undefined;

    if (!body?.data || body.errors?.length) {
      throw new Error(
        `The API refused a request (HTTP ${response.status}): ${
          body?.errors?.map(({ message }) => message).join("; ") ??
          response.statusText
        }`,
      );
    }

    return body.data;
  };

  let writes = 0;

  /** Logs a write, then waits, so the embedding jobs it starts don't pile up. */
  const wrote = async (message: string) => {
    writes += 1;
    console.log(message);
    await sleep(pauseMs);
  };

  const queryLatestTypes = async (
    kind: "propertyTypes" | "entityTypes",
    webId: string,
  ) => {
    const operation =
      kind === "propertyTypes" ? "queryPropertyTypes" : "queryEntityTypes";
    const paramsType =
      kind === "propertyTypes"
        ? "QueryPropertyTypesParams"
        : "QueryEntityTypesParams";

    const data = await graphql<Record<string, Record<string, OntologyType[]>>>(
      `query ($request: ${paramsType}!) { ${operation}(request: $request) }`,
      {
        request: {
          filter: {
            all: [
              { equal: [{ path: ["version"] }, { parameter: "latest" }] },
              { equal: [{ path: ["webId"] }, { parameter: webId }] },
            ],
          },
          temporalAxes: fullTransactionTimeAxis,
        },
      },
    );

    return new Map(
      (data[operation]?.[kind] ?? []).map((type) => [type.schema.title, type]),
    );
  };

  const queryEntitiesInWeb = async (
    webId: string,
    entityTypeBaseUrl: string,
    extraFilter: object[] = [],
  ) => {
    const data = await graphql<{
      queryEntities: { entities: SerializedEntity[] };
    }>(
      `
        query ($request: QueryEntitiesRequest!) {
          queryEntities(request: $request)
        }
      `,
      {
        request: {
          filter: {
            all: [
              {
                equal: [
                  { path: ["type", "baseUrl"] },
                  { parameter: entityTypeBaseUrl },
                ],
              },
              { equal: [{ path: ["webId"] }, { parameter: webId }] },
              { equal: [{ path: ["archived"] }, { parameter: false }] },
              ...extraFilter,
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          includeDrafts: false,
          includePermissions: false,
        },
      },
    );

    return data.queryEntities.entities;
  };

  const { sessionAccount } = await graphql<{
    sessionAccount: { webId: string };
  }>(`
    query {
      sessionAccount {
        webId
      }
    }
  `);

  const webId = webIdFlag ?? sessionAccount.webId;

  console.log(
    `Seeding the company outreach flows into web ${webId} on ${apiUrl}, pausing ${pauseMs} ms after each write…`,
  );

  const existingPropertyTypes = await queryLatestTypes("propertyTypes", webId);
  const properties = {} as Record<PropertyKey, OntologyType>;

  for (const [key, { title, description, dataTypeId }] of Object.entries(
    propertyTypeDefinitions,
  ) as [PropertyKey, (typeof propertyTypeDefinitions)[PropertyKey]][]) {
    const existing = existingPropertyTypes.get(title);

    if (existing) {
      properties[key] = existing;
      continue;
    }

    properties[key] = (
      await graphql<{ createPropertyType: OntologyType }>(
        `
          mutation (
            $webId: WebId!
            $propertyType: ConstructPropertyTypeParams!
          ) {
            createPropertyType(webId: $webId, propertyType: $propertyType)
          }
        `,
        {
          webId,
          propertyType: { title, description, oneOf: [{ $ref: dataTypeId }] },
        },
      )
    ).createPropertyType;

    await wrote(`Created property type ${title}.`);
  }

  const url = (key: PropertyKey) => properties[key].metadata.recordId.baseUrl;

  const existingEntityTypes = await queryLatestTypes("entityTypes", webId);
  let companyType = existingEntityTypes.get(companyTypeTitle);

  if (!companyType) {
    const propertyRefs = [
      blockProtocolPropertyTypes.name.propertyTypeId,
      blockProtocolPropertyTypes.description.propertyTypeId,
      ...Object.values(properties).map(({ schema }) => schema.$id),
    ];
    const baseUrls = [
      nameBaseUrl,
      descriptionBaseUrl,
      ...Object.values(properties).map(
        ({ metadata }) => metadata.recordId.baseUrl,
      ),
    ];

    companyType = (
      await graphql<{ createEntityType: OntologyType }>(
        `
          mutation ($webId: WebId!, $entityType: ConstructEntityTypeParams!) {
            createEntityType(webId: $webId, entityType: $entityType)
          }
        `,
        {
          webId,
          entityType: {
            title: companyTypeTitle,
            description:
              "A company we may write to, with the person to contact there.",
            type: "object",
            icon: "🏢",
            labelProperty: nameBaseUrl,
            properties: Object.fromEntries(
              baseUrls.map((baseUrl, index) => [
                baseUrl,
                { $ref: propertyRefs[index] },
              ]),
            ),
            required: [nameBaseUrl],
          },
        },
      )
    ).createEntityType;

    await wrote(`Created entity type ${companyTypeTitle}.`);
  }

  const existingNames = new Set(
    (
      await queryEntitiesInWeb(webId, companyType.metadata.recordId.baseUrl)
    ).map((entity) => entity.properties[nameBaseUrl]),
  );

  const missing = companies.filter(({ name }) => !existingNames.has(name));

  if (missing.length < companies.length) {
    console.log(
      `${companies.length - missing.length} of the ${companies.length} companies are already in the web.`,
    );
  }

  for (const company of missing) {
    const value = (propertyValue: string | number, dataTypeId: string) => ({
      value: propertyValue,
      metadata: { dataTypeId },
    });

    await graphql(
      `
        mutation (
          $webId: WebId
          $entityTypeIds: [VersionedUrl!]!
          $properties: PropertyObjectWithMetadata!
        ) {
          createEntity(
            webId: $webId
            entityTypeIds: $entityTypeIds
            properties: $properties
          )
        }
      `,
      {
        webId,
        entityTypeIds: [companyType.schema.$id],
        properties: {
          value: {
            [nameBaseUrl]: value(company.name, dataTypeIds.text),
            [descriptionBaseUrl]: value(company.description, dataTypeIds.text),
            [url("industry")]: value(company.industry, dataTypeIds.text),
            [url("size")]: value(company.size, dataTypeIds.number),
            [url("contactName")]: value(company.contactName, dataTypeIds.text),
            [url("contactEmail")]: value(
              company.contactEmail,
              dataTypeIds.email,
            ),
            ...(company.lastContacted === undefined
              ? {}
              : {
                  [url("lastContacted")]: value(
                    company.lastContacted,
                    dataTypeIds.date,
                  ),
                }),
          },
        },
      },
    );

    await wrote(`Created company ${company.name}.`);
  }

  const saveResultFields = "flowDefinitionEntityId isRunnable diagnostics";

  for (const definition of buildFlows(
    {
      company: companyType.metadata.recordId.baseUrl,
      contactEmail: url("contactEmail"),
      lastContacted: url("lastContacted"),
      size: url("size"),
    },
    names,
  )) {
    const { name } = definition;
    const [existingFlow] = await queryEntitiesInWeb(
      webId,
      systemEntityTypes.flowDefinition.entityTypeBaseUrl,
      [{ equal: [{ path: ["properties", nameBaseUrl] }, { parameter: name }] }],
    );

    let saved: FlowSaveResult | undefined;

    if (!existingFlow) {
      saved = (
        await graphql<{ createFlowDefinition: FlowSaveResult }>(
          `
            mutation ($webId: WebId!, $definition: JSONObject!) {
              createFlowDefinition(webId: $webId, definition: $definition) {
                ${saveResultFields}
              }
            }
          `,
          { webId, definition },
        )
      ).createFlowDefinition;

      await wrote(`Created flow "${name}".`);
    } else if (replaceFlow) {
      saved = (
        await graphql<{ updateFlowDefinition: FlowSaveResult }>(
          `
            mutation (
              $flowDefinitionEntityId: EntityId!
              $expectedEditionId: EntityEditionId!
              $definition: JSONObject!
            ) {
              updateFlowDefinition(
                flowDefinitionEntityId: $flowDefinitionEntityId
                expectedEditionId: $expectedEditionId
                definition: $definition
              ) {
                ${saveResultFields}
              }
            }
          `,
          {
            flowDefinitionEntityId: existingFlow.metadata.recordId.entityId,
            expectedEditionId: existingFlow.metadata.recordId.editionId,
            definition,
          },
        )
      ).updateFlowDefinition;

      await wrote(`Replaced the definition of flow "${name}".`);
    } else {
      console.log(
        `The web already has flow "${name}": pass --replace-flow to replace its definition.`,
      );
    }

    if (saved && !saved.isRunnable) {
      console.warn(
        `Warning: flow "${name}" was saved, but the API says it can't run:\n${saved.diagnostics
          .filter(({ severity }) => severity === "error")
          .map(({ message }) => `  - ${message}`)
          .join("\n")}`,
      );
    }

    const flowEntityId =
      existingFlow?.metadata.recordId.entityId ?? saved?.flowDefinitionEntityId;

    console.log(
      `  Open it from the Flows page, or at /@<shortname>/flows/${flowEntityId?.split("~")[1]}/edit.`,
    );
  }

  console.log(`Done, with ${writes} writes.`);
};

const main = async () => {
  const unknownFlags = args.filter(
    (arg, index) =>
      arg.startsWith("--") &&
      ![...valueFlags, ...booleanFlags].includes(arg) &&
      !valueFlags.includes(args[index - 1] ?? ""),
  );

  if (unknownFlags.length > 0) {
    throw new Error(`Unknown option: ${unknownFlags.join(", ")}`);
  }

  const pauseFlag = getFlagValue("--pause-ms");
  const requestedPauseMs =
    pauseFlag === undefined ? defaultPauseMs : Number(pauseFlag);

  if (!Number.isFinite(requestedPauseMs)) {
    throw new Error("--pause-ms needs a number of milliseconds.");
  }

  if (requestedPauseMs < minPauseMs) {
    console.warn(
      `--pause-ms ${requestedPauseMs} is below the floor: pausing ${minPauseMs} ms instead.`,
    );
  }

  const pauseMs = Math.max(minPauseMs, requestedPauseMs);

  const webIdFlag = getFlagValue("--web-id");

  if (
    webIdFlag !== undefined &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      webIdFlag,
    )
  ) {
    throw new Error("--web-id needs the uuid of a web.");
  }

  const dataFlag = getFlagValue("--data");

  /* `yarn workspace` runs the script in the package's directory, so a relative path is from where yarn was run. */
  const companies = readCompanies(
    dataFlag !== undefined
      ? path.resolve(process.env.INIT_CWD ?? process.cwd(), dataFlag)
      : path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          "flow-company-outreach/companies.json",
        ),
  );

  const onlyFlag = getFlagValue("--only");
  const names =
    onlyFlag === undefined
      ? flowNames
      : onlyFlag.split(",").map((name) => name.trim());
  const unknownNames = names.filter((name) => !flowNames.includes(name));

  if (unknownNames.length > 0) {
    throw new Error(
      `--only names flows this script doesn't have: ${unknownNames.join(", ")}. It has "${flowNames.join('" and "')}".`,
    );
  }

  if (args.includes("--dry-run")) {
    printDryRun(companies, pauseMs, names);
    return;
  }

  await seed({
    companies,
    pauseMs,
    webIdFlag,
    replaceFlow: args.includes("--replace-flow"),
    names,
  });
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
