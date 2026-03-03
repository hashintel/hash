import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { AutomaticInferenceSettings } from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-types";
import { generateVersionedUrlMatchingFilter } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { BrowserPluginSettings } from "@local/hash-isomorphic-utils/system-types/shared";
import { StatusCode } from "@local/status";

import { getEntityByFilter } from "../shared/get-entity-by-filter.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";

export const processAutomaticBrowsingSettingsAction: AiFlowActionActivity<
  "processAutomaticBrowsingSettings"
> = async ({ inputs }) => {
  const { webPage } = getSimplifiedAiFlowActionInputs({
    inputs,
    actionType: "processAutomaticBrowsingSettings",
  });

  const { url } = webPage;

  const { userAuthentication } = await getFlowContext();

  const userBrowserPluginSettings = await getEntityByFilter({
    actorId: userAuthentication.actorId,
    filter: {
      all: [
        {
          equal: [
            { path: ["webId"] },
            { parameter: userAuthentication.actorId },
          ],
        },
        generateVersionedUrlMatchingFilter(
          systemEntityTypes.browserPluginSettings.entityTypeId,
          { ignoreParents: true },
        ),
      ],
    },
    graphApiClient,
    includeDrafts: false,
  });

  if (!userBrowserPluginSettings) {
    throw new Error("User has no browser plugin settings configured");
  }

  const automaticInferenceConfig = (
    userBrowserPluginSettings as HashEntity<BrowserPluginSettings>
  ).properties[
    "https://hash.ai/@h/types/property-type/automatic-inference-configuration/"
  ];

  if (Object.keys(automaticInferenceConfig).length === 0) {
    throw new Error(
      "User has no automatic inference config set in browser plugin settings",
    );
  }

  const { createAs, enabled, model, rules } =
    automaticInferenceConfig as AutomaticInferenceSettings;

  if (!enabled) {
    return {
      code: StatusCode.Cancelled,
      contents: [],
      message: "Automatic inference is disabled",
    };
  }

  const applicableRules = rules.filter(({ restrictToDomains }) => {
    const pageHostname = new URL(url).hostname;

    if (pageHostname === "app.hash.ai" || pageHostname === "hash.ai") {
      return false;
    }

    return (
      restrictToDomains.length === 0 ||
      restrictToDomains.some(
        (domainToMatch) =>
          pageHostname === domainToMatch ||
          pageHostname.endsWith(`.${domainToMatch}`),
      )
    );
  });

  if (applicableRules.length === 0) {
    return {
      code: StatusCode.Cancelled,
      contents: [],
      message: `No automatic inference rules matched URL ${url}`,
    };
  }

  const entityTypeIdsToInfer = applicableRules.map(
    ({ entityTypeId }) => entityTypeId,
  );

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName: "draft",
            payload: {
              kind: "Boolean",
              value: createAs === "draft",
            },
          },
          {
            outputName: "entityTypeIds",
            payload: {
              kind: "VersionedUrl",
              value: entityTypeIdsToInfer,
            },
          },
          {
            outputName: "model",
            payload: {
              kind: "Text",
              value: model,
            },
          },
        ],
      },
    ],
  };
};
