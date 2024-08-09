import { getHashInstanceAdminAccountGroupId } from "@local/hash-backend-utils/hash-instance";
import type { OwnedById } from "@local/hash-graph-types/web";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { ProspectiveUser } from "@local/hash-isomorphic-utils/system-types/prospectiveuser";

import { createEntity } from "../../../../graph/knowledge/primitive/entity.js";
import { systemAccountId } from "../../../../graph/system-account.js";
import type {
  MutationSubmitEarlyAccessFormArgs,
  ResolverFn,
} from "../../../api-types.gen.js";
import type { LoggedInGraphQLContext } from "../../../context.js";
import { graphQLContextToImpureGraphContext } from "../../util.js";

export const submitEarlyAccessFormResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationSubmitEarlyAccessFormArgs
> = async (_, { properties }, graphQLContext) => {
  const { user } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const adminAccountGroupId = await getHashInstanceAdminAccountGroupId(
    context,
    { actorId: systemAccountId },
  );

  await createEntity<ProspectiveUser>(
    context,
    /** The user does not yet have permissions to create entities, so we do it with the HASH system account instead */
    { actorId: systemAccountId },
    {
      ownedById: user.accountId as OwnedById,
      entityTypeId: systemEntityTypes.prospectiveUser.entityTypeId,
      properties: {
        value: {
          "https://hash.ai/@hash/types/property-type/current-approach/": {
            value:
              properties[
                "https://hash.ai/@hash/types/property-type/current-approach/"
              ],
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
          "https://hash.ai/@hash/types/property-type/email/": {
            value:
              properties["https://hash.ai/@hash/types/property-type/email/"],
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
          "https://hash.ai/@hash/types/property-type/intended-use/": {
            value:
              properties[
                "https://hash.ai/@hash/types/property-type/intended-use/"
              ],
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
          "https://hash.ai/@hash/types/property-type/role/": {
            value:
              properties["https://hash.ai/@hash/types/property-type/role/"],
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
          "https://hash.ai/@hash/types/property-type/website-url/": {
            value:
              properties[
                "https://hash.ai/@hash/types/property-type/website-url/"
              ],
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
          "https://hash.ai/@hash/types/property-type/willing-to-pay/": {
            value:
              properties[
                "https://hash.ai/@hash/types/property-type/willing-to-pay/"
              ],
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
      },
      relationships: [
        {
          relation: "administrator",
          subject: {
            kind: "account",
            subjectId: systemAccountId,
          },
        },
        {
          relation: "viewer",
          subject: {
            kind: "accountGroup",
            subjectId: adminAccountGroupId,
            subjectSet: "member",
          },
        },
        {
          relation: "viewer",
          subject: {
            kind: "account",
            subjectId: user.accountId,
          },
        },
        {
          relation: "setting",
          subject: {
            kind: "setting",
            subjectId: "administratorFromWeb",
          },
        },
        {
          relation: "setting",
          subject: {
            kind: "setting",
            subjectId: "viewFromWeb",
          },
        },
      ],
    },
  );

  if (process.env.ACCESS_FORM_SLACK_WEBHOOK_URL) {
    const simpleProperties = simplifyProperties(properties);
    const slackMessage = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "Early Access Form Submission",
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: Object.entries(simpleProperties)
                .map(([key, value]) => `*${key}*: ${value}`)
                .join("\n"),
            },
          ],
        },
        {
          type: "divider",
        },
      ],
    };

    void fetch(process.env.ACCESS_FORM_SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(slackMessage),
    });
  }

  return true;
};
