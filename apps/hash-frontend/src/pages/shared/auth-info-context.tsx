import { useLazyQuery } from "@apollo/client";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { OrgMembershipProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  AccountGroupId,
  EntityRootType,
  extractEntityUuidFromEntityId,
  Subgraph,
  Timestamp,
  Uuid,
} from "@local/hash-subgraph";
import {
  assertEntityRootedSubgraph,
  getOutgoingLinksForEntity,
  getRoots,
  intervalForTimestamp,
} from "@local/hash-subgraph/stdlib";
import { LinkEntity } from "@local/hash-subgraph/type-system-patch";
import {
  createContext,
  FunctionComponent,
  ReactElement,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { useOrgsWithLinks } from "../../components/hooks/use-orgs-with-links";
import { MeQuery } from "../../graphql/api-types.gen";
import { meQuery } from "../../graphql/queries/user.queries";
import {
  constructUser,
  isEntityUserEntity,
  User,
} from "../../lib/user-and-org";
import { fetchKratosSession } from "./ory-kratos";

type RefetchAuthInfoFunction = () => Promise<{
  authenticatedUser?: User;
}>;

type AuthInfoContextValue = {
  authenticatedUser?: User;
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

  const [getMe] = useLazyQuery<MeQuery>(meQuery, {
    fetchPolicy: "cache-and-network",
  });

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
        types.linkEntityType.orgMembership.linkEntityTypeId,
    ) as LinkEntity<OrgMembershipProperties>[];
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

  const fetchAuthenticatedUser =
    useCallback<RefetchAuthInfoFunction>(async () => {
      const [subgraph, kratosSession] = await Promise.all([
        getMe()
          .then(({ data }) => data?.me.subgraph)
          .catch(() => undefined),
        fetchKratosSession(),
      ]);

      if (!subgraph || !kratosSession) {
        setAuthenticatedUserSubgraph(undefined);
        return {};
      }

      assertEntityRootedSubgraph(subgraph);

      setAuthenticatedUserSubgraph(subgraph);

      return { authenticatedUser: constructUserValue(subgraph) };
    }, [constructUserValue, getMe]);

  const value = useMemo(
    () => ({
      authenticatedUser: constructUserValue(authenticatedUserSubgraph),
      refetch: async () => {
        // Refetch the detail on orgs in case this refetch is following them being modified
        await refetchOrgs();
        return fetchAuthenticatedUser();
      },
    }),
    [
      authenticatedUserSubgraph,
      constructUserValue,
      fetchAuthenticatedUser,
      refetchOrgs,
    ],
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
