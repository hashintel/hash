import { useApolloClient } from "@apollo/client";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import {
  getOutgoingLinksForEntity,
  getRoots,
  intervalForTimestamp,
} from "@blockprotocol/graph/stdlib";
import type { ActorGroupEntityUuid } from "@blockprotocol/type-system";
import {
  currentTimestamp,
  extractEntityUuidFromEntityId,
} from "@blockprotocol/type-system";
import { type HashEntity, HashLinkEntity } from "@local/hash-graph-sdk/entity";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { IsMemberOf } from "@local/hash-isomorphic-utils/system-types/shared";
import type { VerifiableIdentityAddress } from "@ory/client";
import type { AxiosError } from "axios";
import type { FunctionComponent, ReactElement } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useHashInstance } from "../../components/hooks/use-hash-instance";
import { useOrgsWithLinks } from "../../components/hooks/use-orgs-with-links";
import type { MeQuery } from "../../graphql/api-types.gen";
import { meQuery } from "../../graphql/queries/user.queries";
import type { User } from "../../lib/user-and-org";
import { constructUser, isEntityUserEntity } from "../../lib/user-and-org";
import { oryKratosClient } from "./ory-kratos";

type RefetchAuthInfoFunction = () => Promise<{
  authenticatedUser?: User;
}>;

type AuthInfoContextValue = {
  aal2Required: boolean;
  authenticatedUser?: User;
  emailVerificationStatusKnown: boolean;
  isInstanceAdmin: boolean | undefined;
  refetch: RefetchAuthInfoFunction;
};

export const AuthInfoContext = createContext<AuthInfoContextValue | undefined>(
  undefined,
);

type AuthInfoProviderProps = {
  initialAuthenticatedUserSubgraph?: Subgraph<EntityRootType<HashEntity>>;
  children: ReactElement;
};

export const AuthInfoProvider: FunctionComponent<AuthInfoProviderProps> = ({
  initialAuthenticatedUserSubgraph,
  children,
}) => {
  const [authenticatedUserSubgraph, setAuthenticatedUserSubgraph] = useState(
    initialAuthenticatedUserSubgraph,
  ); // use the initial server-sent data to start – after that, the client controls the value
  const [verifiableAddresses, setVerifiableAddresses] = useState<
    VerifiableIdentityAddress[]
  >([]);
  const [aal2Required, setAal2Required] = useState(false);
  const [emailVerificationStatusKnown, setEmailVerificationStatusKnown] =
    useState(false);

  const userMemberOfLinks = useMemo(() => {
    if (!authenticatedUserSubgraph) {
      return undefined;
    }

    const userEntity = getRoots(authenticatedUserSubgraph)[0]!;

    if (!isEntityUserEntity(userEntity)) {
      throw new Error(
        `Entity with type(s) ${userEntity.metadata.entityTypeIds.join(", ")} is not a user entity`,
      );
    }

    return getOutgoingLinksForEntity(
      authenticatedUserSubgraph,
      userEntity.metadata.recordId.entityId,
      intervalForTimestamp(currentTimestamp()),
    )
      .filter((linkEntity) =>
        linkEntity.metadata.entityTypeIds.includes(
          systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
        ),
      )
      .map((linkEntity) => new HashLinkEntity<IsMemberOf>(linkEntity));
  }, [authenticatedUserSubgraph]);

  const { orgs: resolvedOrgs, refetch: refetchOrgs } = useOrgsWithLinks({
    orgAccountGroupIds:
      userMemberOfLinks?.map(
        (link) =>
          extractEntityUuidFromEntityId(
            link.linkData.rightEntityId,
          ) as string as ActorGroupEntityUuid,
      ) ?? [],
  });

  const constructUserValue = useCallback(
    (
      subgraph: Subgraph<EntityRootType<HashEntity>> | undefined,
      suppliedVerifiableAddresses: VerifiableIdentityAddress[],
    ) => {
      if (!subgraph) {
        return undefined;
      }

      const userEntity = getRoots(subgraph)[0]!;

      if (!isEntityUserEntity(userEntity)) {
        throw new Error(
          `Entity with type(s) ${userEntity.metadata.entityTypeIds.join(", ")} is not a user entity`,
        );
      }

      return constructUser({
        orgMembershipLinks: userMemberOfLinks,
        subgraph,
        resolvedOrgs,
        userEntity,
        verifiableAddresses: suppliedVerifiableAddresses,
      });
    },
    [resolvedOrgs, userMemberOfLinks],
  );

  const apolloClient = useApolloClient();

  const { isUserAdmin: isInstanceAdmin } = useHashInstance();

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
      const [subgraph, kratosSessionResult] = await Promise.all([
        apolloClient
          .query<MeQuery>({
            query: meQuery,
            fetchPolicy: "network-only",
          })
          .then(({ data }) =>
            mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType<HashEntity>>(
              data.me.subgraph,
            ),
          )
          .catch(() => undefined),
        oryKratosClient
          .toSession()
          .then(({ data }) => ({
            aal2Required: false,
            emailVerificationStatusKnown: true,
            session: data,
          }))
          .catch((error: AxiosError) => ({
            aal2Required: error.response?.status === 403,
            emailVerificationStatusKnown: error.response?.status !== 403,
            session: undefined,
          })),
      ]);

      if (kratosSessionResult.emailVerificationStatusKnown) {
        setVerifiableAddresses(
          kratosSessionResult.session?.identity?.verifiable_addresses ?? [],
        );
      }

      setAal2Required(kratosSessionResult.aal2Required);
      setEmailVerificationStatusKnown(
        kratosSessionResult.emailVerificationStatusKnown,
      );

      if (!subgraph) {
        setAuthenticatedUserSubgraph(undefined);
        return {};
      }

      setAuthenticatedUserSubgraph(subgraph);

      const newVerifiableAddresses =
        kratosSessionResult.session?.identity?.verifiable_addresses ?? [];

      return {
        authenticatedUser: constructUserValue(subgraph, newVerifiableAddresses),
      };
    }, [constructUserValue, apolloClient]);

  useEffect(() => {
    void fetchAuthenticatedUser();
  }, [fetchAuthenticatedUser]);

  const authenticatedUser = useMemo(
    () => constructUserValue(authenticatedUserSubgraph, verifiableAddresses),
    [authenticatedUserSubgraph, constructUserValue, verifiableAddresses],
  );

  const value = useMemo(
    () => ({
      aal2Required,
      authenticatedUser,
      emailVerificationStatusKnown,
      isInstanceAdmin,
      refetch: async () => {
        // Refetch the detail on orgs in case this refetch is following them being modified
        await refetchOrgs();
        return fetchAuthenticatedUser();
      },
    }),
    [
      aal2Required,
      authenticatedUser,
      emailVerificationStatusKnown,
      isInstanceAdmin,
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
