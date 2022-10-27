import { QueryHookOptions, useQuery } from "@apollo/client";
import * as Sentry from "@sentry/nextjs";
import { useRouter } from "next/router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Session } from "@ory/client";
import { types } from "@hashintel/hash-shared/types";
import { extractBaseUri } from "@blockprotocol/type-system-web";
import { LinkVertex, EntityVertex } from "@hashintel/hash-shared/graphql/types";
import { meQuery } from "../../graphql/queries/user.queries";
import { MeQuery, MeQueryVariables } from "../../graphql/apiTypes.gen";
import { oryKratosClient } from "../../pages/shared/ory-kratos";
import {
  extractEntityRoot,
  RootEntityAndSubgraph,
  Subgraph,
} from "../../lib/subgraph";
import { UserWithOrgMemberships } from "../shared/user.util";
import { useInitTypeSystem } from "../../lib/use-init-type-system";

const getOutgoingLinksOfEntity = (params: {
  entityId: string;
  subgraph: Subgraph;
  linkTypeId?: string;
}): LinkVertex[] => {
  const { entityId, subgraph, linkTypeId } = params;

  const outgoingLinks = subgraph.edges[entityId]!.filter(
    ({ edgeKind }) => edgeKind === "HAS_LINK",
  ).map(({ destination }) => subgraph.vertices[destination] as LinkVertex);

  return linkTypeId
    ? outgoingLinks.filter(({ inner }) => inner.inner.linkTypeId === linkTypeId)
    : outgoingLinks;
};

const constructUser = (params: {
  userEntityRootedSubgraph: RootEntityAndSubgraph;
  kratosSession: Session;
}): UserWithOrgMemberships => {
  const { userEntityRootedSubgraph } = params;

  const { root: userEntity } = userEntityRootedSubgraph;

  const { entityId, properties } = userEntity;

  const shortname: string =
    properties[extractBaseUri(types.propertyType.shortName.propertyTypeId)];

  const preferredName: string =
    properties[extractBaseUri(types.propertyType.preferredName.propertyTypeId)];

  const primaryEmailAddress: string =
    properties[extractBaseUri(types.propertyType.email.propertyTypeId)];

  const accountSignupComplete = !!shortname && !!preferredName;

  const isPrimaryEmailAddressVerified =
    params.kratosSession.identity.verifiable_addresses?.find(
      ({ value }) => value === primaryEmailAddress,
    )?.verified === true;

  const { subgraph } = userEntityRootedSubgraph;

  const outgoingHasMembershipLinks = getOutgoingLinksOfEntity({
    entityId,
    subgraph,
    linkTypeId: types.linkType.hasMembership.linkTypeId,
  });

  const orgMemberships = outgoingHasMembershipLinks.map(
    ({ inner }) =>
      subgraph.vertices[inner.inner.targetEntityId] as unknown as EntityVertex,
  );

  return {
    entityId,
    shortname,
    preferredName,
    accountSignupComplete,
    emails: [
      {
        address: primaryEmailAddress,
        verified: isPrimaryEmailAddressVerified,
        primary: true,
      },
    ],
    memberOf: orgMemberships.map(({ inner: orgMembershipEntity }) => {
      const responsibility: string =
        orgMembershipEntity.properties[
          extractBaseUri(types.propertyType.responsibility.propertyTypeId)
        ];

      const outgoingOfOrgLinks = getOutgoingLinksOfEntity({
        entityId: orgMembershipEntity.entityId,
        subgraph,
        linkTypeId: types.linkType.ofOrg.linkTypeId,
      });

      const orgEntity = subgraph.vertices[
        outgoingOfOrgLinks[0]!.inner.inner.targetEntityId
      ]! as unknown as EntityVertex;

      const { entityId: orgEntityId, properties: orgProperties } =
        orgEntity.inner;

      const orgShortname: string =
        orgProperties[
          extractBaseUri(types.propertyType.shortName.propertyTypeId)
        ];

      const orgName: string =
        orgProperties[
          extractBaseUri(types.propertyType.orgName.propertyTypeId)
        ];

      return {
        responsibility,
        entityId: orgEntityId,
        shortname: orgShortname,
        name: orgName,
        /** @todo: set this */
        numberOfMembers: 0,
      };
    }),
  };
};

/**
 * Returns an object containing:
 *
 * user: the authenticated user (if any)
 *
 * refetch: a function to refetch the user from the API (ApolloClient will update the cache with the return)
 *
 * loading: a boolean to check if the api call is still loading
 */
export const useUser = (
  options?: Omit<QueryHookOptions<MeQuery, MeQueryVariables>, "errorPolicy">,
  forceLogin = false,
) => {
  const loadingTypeSystem = useInitTypeSystem();
  const router = useRouter();

  /** @todo: store this in a react context if we have a use for it long-term */
  const [kratosSession, setKratosSession] = useState<Session>();
  const [loadingKratosSession, setLoadingKratosSession] =
    useState<boolean>(true);

  const {
    data: meQueryResponseData,
    refetch: refetchUser,
    loading: loadingUser,
  } = useQuery<MeQuery, MeQueryVariables>(meQuery, {
    ...options,
    errorPolicy: "all",
  });

  const { me: subgraph } = meQueryResponseData ?? {};

  const user = useMemo<UserWithOrgMemberships | undefined>(
    () =>
      !loadingTypeSystem && subgraph && kratosSession
        ? constructUser({
            userEntityRootedSubgraph: extractEntityRoot(
              subgraph as unknown as Subgraph,
            ),
            kratosSession,
          })
        : undefined,
    [subgraph, kratosSession, loadingTypeSystem],
  );

  useEffect(() => {
    Sentry.configureScope((scope) => {
      const sentryUser = scope.getUser();
      if (!user && sentryUser) {
        scope.setUser(null);
      } else if (user && sentryUser?.id !== user.entityId) {
        const primaryEmail = user.emails.find((email) => email.primary);
        Sentry.setUser({ id: user.entityId, email: primaryEmail?.address });
      }
    });
  }, [user]);

  const fetchKratosIdentity = async (login: boolean) => {
    setLoadingKratosSession(true);

    const session = await oryKratosClient
      .toSession()
      .then(({ data }) => data)
      .catch(() => undefined);

    if (!session && login) {
      await router.push("/login");
    } else {
      setKratosSession(session);
      setLoadingKratosSession(false);
    }
  };

  const fetchKratosIdentityRef = useRef(fetchKratosIdentity);
  useLayoutEffect(() => {
    fetchKratosIdentityRef.current = fetchKratosIdentity;
  });

  useEffect(() => {
    void fetchKratosIdentityRef.current(forceLogin);
  }, [forceLogin]);

  /**
   * @todo add method to manually update user cache after
   * a query/mutation returns the updated User object.
   * This will help prevent having to call meQuery after every mutation
   */
  // const updateCache = () => {
  //   client.writeQuery();
  // };

  return {
    user,
    kratosSession,
    refetch: () =>
      Promise.all([refetchUser(), fetchKratosIdentity(forceLogin)]),
    loading: loadingUser || loadingKratosSession,
  };
};

export const useLoggedInUser = (options?: Parameters<typeof useUser>[0]) => {
  return useUser(options, true);
};
