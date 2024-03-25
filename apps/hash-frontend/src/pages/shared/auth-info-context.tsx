import { useApolloClient, useQuery } from "@apollo/client";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { checkUserPermissionsOnEntityQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { IsMemberOfProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type {
  AccountGroupId,
  EntityMetadata,
  EntityRootType,
  Subgraph,
  Timestamp,
  Uuid,
} from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import {
  getOutgoingLinksForEntity,
  getRoots,
  intervalForTimestamp,
} from "@local/hash-subgraph/stdlib";
import type { LinkEntity } from "@local/hash-subgraph/type-system-patch";
import type { FunctionComponent, ReactElement } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { useHashInstance } from "../../components/hooks/use-hash-instance";
import { useOrgsWithLinks } from "../../components/hooks/use-orgs-with-links";
import type {
  CheckUserPermissionsOnEntityQuery,
  CheckUserPermissionsOnEntityQueryVariables,
  MeQuery,
} from "../../graphql/api-types.gen";
import { meQuery } from "../../graphql/queries/user.queries";
import type { User } from "../../lib/user-and-org";
import { constructUser, isEntityUserEntity } from "../../lib/user-and-org";

type RefetchAuthInfoFunction = () => Promise<{
  authenticatedUser?: User;
}>;

type AuthInfoContextValue = {
  authenticatedUser?: User;
  isInstanceAdmin: boolean | undefined;
  refetch: RefetchAuthInfoFunction;
};

export const AuthInfoContext = createContext<AuthInfoContextValue | undefined>(
  undefined,
);

type AuthInfoProviderProps = {
  initialAuthenticatedUserSubgraph?: Subgraph<EntityRootType>;
  children: ReactElement;
};

export const AuthInfoProvider: FunctionComponent<AuthInfoProviderProps> = ({
  initialAuthenticatedUserSubgraph,
  children,
}) => {
  const [authenticatedUserSubgraph, setAuthenticatedUserSubgraph] = useState(
    initialAuthenticatedUserSubgraph,
  ); // use the initial server-sent data to start – after that, the client controls the value

  const userMemberOfLinks = useMemo(() => {
    if (!authenticatedUserSubgraph) {
      return undefined;
    }

    const userEntity = getRoots(authenticatedUserSubgraph)[0]!;

    if (!isEntityUserEntity(userEntity)) {
      throw new Error(
        `Entity with type ${userEntity.metadata.entityTypeId} is not a user entity`,
      );
    }

    return getOutgoingLinksForEntity(
      authenticatedUserSubgraph,
      userEntity.metadata.recordId.entityId,
      intervalForTimestamp(new Date().toISOString() as Timestamp),
    ).filter(
      (linkEntity) =>
        linkEntity.metadata.entityTypeId ===
        systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
    ) as LinkEntity<IsMemberOfProperties>[];
  }, [authenticatedUserSubgraph]);

  const { orgs: resolvedOrgs, refetch: refetchOrgs } = useOrgsWithLinks({
    orgAccountGroupIds:
      userMemberOfLinks?.map(
        (link) =>
          extractEntityUuidFromEntityId(
            link.linkData.rightEntityId,
          ) as Uuid as AccountGroupId,
      ) ?? [],
  });

  const constructUserValue = useCallback(
    (subgraph: Subgraph<EntityRootType> | undefined) => {
      if (!subgraph) {
        return undefined;
      }

      const userEntity = getRoots(subgraph)[0]!;

      if (!isEntityUserEntity(userEntity)) {
        throw new Error(
          `Entity with type ${userEntity.metadata.entityTypeId} is not a user entity`,
        );
      }

      return constructUser({
        orgMembershipLinks: userMemberOfLinks,
        subgraph,
        resolvedOrgs,
        userEntity,
      });
    },
    [resolvedOrgs, userMemberOfLinks],
  );

  const apolloClient = useApolloClient();

  const { hashInstance } = useHashInstance();

  const fetchAuthenticatedUser =
    useCallback<RefetchAuthInfoFunction>(async () => {
      /**
       * @todo: use the `useLazyQuery` hook instead of the `apolloClient`
       * here. This requires upgrading the `@apollo/client` to fix issue
       * in the `useLazyQuery` hook that causes outdated data to be
       * returned if an error is encountered by the query.
       *
       * @see https://linear.app/hash/issue/H-2182/upgrade-apolloclient-to-latest-version-to-fix-uselazyquery-behaviour
       * @see https://github.com/apollographql/apollo-client/issues/6086
       */
      const subgraph = await apolloClient
        .query<MeQuery>({
          query: meQuery,
          fetchPolicy: "network-only",
        })
        .then(({ data }) =>
          mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
            data.me.subgraph,
          ),
        )
        .catch(() => undefined);

      if (!subgraph) {
        setAuthenticatedUserSubgraph(undefined);
        return {};
      }

      setAuthenticatedUserSubgraph(subgraph);

      return { authenticatedUser: constructUserValue(subgraph) };
    }, [constructUserValue, apolloClient]);

  const authenticatedUser = useMemo(
    () => constructUserValue(authenticatedUserSubgraph),
    [authenticatedUserSubgraph, constructUserValue],
  );

  const { data: userPermissionsOnHashInstance } = useQuery<
    CheckUserPermissionsOnEntityQuery,
    CheckUserPermissionsOnEntityQueryVariables
  >(checkUserPermissionsOnEntityQuery, {
    variables: {
      // The query is skipped if `hashInstance` is `undefined`
      metadata: hashInstance?.metadata as EntityMetadata,
    },
    skip: !hashInstance || !authenticatedUser,
  });

  const isInstanceAdmin = useMemo(() => {
    if (!userPermissionsOnHashInstance) {
      return undefined;
    }

    return userPermissionsOnHashInstance.checkUserPermissionsOnEntity.edit;
  }, [userPermissionsOnHashInstance]);

  const value = useMemo(
    () => ({
      authenticatedUser,
      isInstanceAdmin,
      refetch: async () => {
        // Refetch the detail on orgs in case this refetch is following them being modified
        await refetchOrgs();
        return fetchAuthenticatedUser();
      },
    }),
    [authenticatedUser, isInstanceAdmin, fetchAuthenticatedUser, refetchOrgs],
  );

  return (
    <AuthInfoContext.Provider value={value}>
      {children}
    </AuthInfoContext.Provider>
  );
};

export const useAuthInfo = (): AuthInfoContextValue => {
  const authInfo = useContext(AuthInfoContext);

  if (!authInfo) {
    throw new Error(
      "Cannot use auth info because it has not been defined. Verify `useAuthInfo` is being called within a child of the `AuthInfoProvider`.",
    );
  }

  return authInfo;
};

/**
 * Use the currently authenticated user.
 *
 * @throws if there is no user authenticated in the application.
 * @returns `AuthInfo` where the `authenticatedUser` is always defined.
 */
export const useAuthenticatedUser = (): AuthInfoContextValue & {
  authenticatedUser: User;
} => {
  const { authenticatedUser, ...remainingAuthInfo } = useAuthInfo();

  if (!authenticatedUser) {
    throw new Error(
      "There is no authenticated user. Consider using the `useAuthInfo` hook instead if this is expected.",
    );
  }

  return { authenticatedUser, ...remainingAuthInfo };
};
