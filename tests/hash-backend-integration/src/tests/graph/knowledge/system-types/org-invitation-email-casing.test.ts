import { beforeAll, describe, expect, it } from "vitest";

import {
  createKratosIdentity,
  deleteKratosIdentity,
} from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import { createOrg } from "@apps/hash-api/src/graph/knowledge/system-types/org";
import {
  checkEmailVerificationAndUsageStatus,
  createUser,
  getUserPendingInvitations,
  getUserVerifiedEmails,
  isUserMemberOfOrg,
} from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { systemAccountId } from "@apps/hash-api/src/graph/system-account";
import { acceptOrgInvitationResolver } from "@apps/hash-api/src/graphql/resolvers/knowledge/org/accept-org-invitation";
import { inviteUserToOrgResolver } from "@apps/hash-api/src/graphql/resolvers/knowledge/org/invite-user-to-org";
import { Logger } from "@local/hash-backend-utils/logger";
import { addActorGroupAdministrator } from "@local/hash-graph-sdk/principal/actor-group";

import {
  createTestImpureGraphContext,
  createTestUser,
  generateRandomShortname,
} from "../../../util";

import type { EmailTransporter } from "@apps/hash-api/src/email/transporters";
import type { Org } from "@apps/hash-api/src/graph/knowledge/system-types/org";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import type { LoggedInGraphQLContext } from "@apps/hash-api/src/graphql/context";
import type { EntityId } from "@blockprotocol/type-system";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { GraphQLResolveInfo } from "graphql";

const logger = new Logger({
  environment: "test",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();

// Resolvers ignore `info`; a cast keeps the call signature satisfied.
const resolverInfo = {} as unknown as GraphQLResolveInfo;

const graphQLContextForUser = (user: User): LoggedInGraphQLContext => ({
  dataSources: {
    graphApi: graphContext.graphApi,
    uploadProvider: graphContext.uploadProvider,
  },
  emailTransporter: {
    sendMail: async () => {},
  } as unknown as EmailTransporter,
  logger,
  authentication: { actorId: user.accountId },
  user,
  provenance: { ...graphContext.provenance, actorType: "user" },
  temporal: graphContext.temporalClient,
});

describe("org invitation with a mixed-case signup email", () => {
  // Shortname must be lowercase, but the email deliberately carries upper-case
  // characters to reproduce a cased signup.
  const shortname = generateRandomShortname("invcase");
  const casedEmail = `Cased-${shortname}@Example.com`;
  const lowercasedEmail = casedEmail.toLowerCase();

  let invitee: User;
  let inviter: User;
  let testOrg: Org;
  let systemAuthentication: AuthenticationContext;
  let invitationEntityId: EntityId;

  beforeAll(async () => {
    await ensureSystemGraphIsInitialized({
      logger,
      context: graphContext,
      seedSystemPolicies: true,
    });

    // `systemAccountId` is only populated during system-graph init.
    systemAuthentication = { actorId: systemAccountId };

    const identity = await createKratosIdentity({
      traits: { emails: [casedEmail] },
      verifyEmails: true,
    });

    invitee = await createUser(graphContext, systemAuthentication, {
      emails: [casedEmail],
      kratosIdentityId: identity.id,
      shortname,
      displayName: shortname,
    });

    // Create the org as the system account (a machine actor, matching the test
    // context's provenance), then grant the inviter the administrator role the
    // invite resolver requires.
    inviter = await createTestUser(graphContext, "invadmin", logger);
    testOrg = await createOrg(graphContext, systemAuthentication, {
      name: "Invite Casing Test Org",
      shortname: generateRandomShortname("invorg"),
    });
    await addActorGroupAdministrator(
      graphContext.graphApi,
      systemAuthentication,
      {
        actorId: inviter.accountId,
        actorGroupId: testOrg.webId,
      },
    );

    return async () => {
      await deleteKratosIdentity({
        kratosIdentityId: invitee.kratosIdentityId,
      });
      await deleteKratosIdentity({
        kratosIdentityId: inviter.kratosIdentityId,
      });
    };
  });

  it("normalizes the email when building the user from the entity", () => {
    expect(invitee.emails).toContain(lowercasedEmail);
    expect(invitee.emails).not.toContain(casedEmail);
  });

  it("resolves the cased user via a differently-cased email lookup", async () => {
    const result = await checkEmailVerificationAndUsageStatus(
      casedEmail.toUpperCase(),
    );

    expect(result.status).toBe("verified");
    if (result.status === "verified") {
      expect(result.kratosIdentityId).toBe(invitee.kratosIdentityId);
    }
  });

  it("reports the verified email in normalized form", async () => {
    const verifiedEmails = await getUserVerifiedEmails(
      graphContext,
      systemAuthentication,
      { user: invitee },
    );

    expect(verifiedEmails).toContain(lowercasedEmail);
  });

  it("lets an org admin invite the cased user by a differently-cased email", async () => {
    const invited = await inviteUserToOrgResolver(
      {},
      { orgWebId: testOrg.webId, userEmail: casedEmail.toUpperCase() },
      graphQLContextForUser(inviter),
      resolverInfo,
    );

    expect(invited).toBe(true);

    const pendingInvitations = await getUserPendingInvitations(
      graphContext,
      systemAuthentication,
      { user: invitee },
    );

    expect(pendingInvitations).toHaveLength(1);
    invitationEntityId = pendingInvitations[0]!.invitationEntityId;
  });

  it("lets the cased user accept the invitation and become a member", async () => {
    const result = await acceptOrgInvitationResolver(
      {},
      { orgInvitationEntityId: invitationEntityId },
      graphQLContextForUser(invitee),
      resolverInfo,
    );

    expect(result.accepted).toBe(true);

    const isMember = await isUserMemberOfOrg(
      graphContext,
      systemAuthentication,
      {
        userEntityId: invitee.entity.metadata.recordId.entityId,
        orgEntityUuid: testOrg.webId,
      },
    );

    expect(isMember).toBe(true);
  });

  it("does not resolve a never-registered email", async () => {
    const result = await checkEmailVerificationAndUsageStatus(
      `never-${shortname}@example.com`,
    );

    expect(result.status).toBe("email-not-found");
  });
});
