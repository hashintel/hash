import { useQuery } from "@apollo/client";
import type {
  DataTypeRootType,
  EntityRootType,
  EntityTypeRootType,
  PropertyTypeRootType,
} from "@blockprotocol/graph";
import {
  getEntityTypeAndDescendantsById,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import type {
  BaseUrl,
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";
import { extractBaseUrl } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { pluralize } from "@local/hash-isomorphic-utils/pluralize";
import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
  QueryDataTypesQuery,
  QueryDataTypesQueryVariables,
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
  QueryPropertyTypesQuery,
  QueryPropertyTypesQueryVariables,
} from "../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";
import { queryDataTypesQuery } from "../../graphql/queries/ontology/data-type.queries";
import { queryEntityTypesQuery } from "../../graphql/queries/ontology/entity-type.queries";
import { queryPropertyTypesQuery } from "../../graphql/queries/ontology/property-type.queries";
import {
  constructOrg,
  constructUser,
  isEntityUserEntity,
} from "../../lib/user-and-org";
import { useLatestEntityTypesOptional } from "../../shared/entity-types-context/hooks";
import type { NextPageWithLayout } from "../../shared/layout";
import { getLayoutWithSidebar } from "../../shared/layout";
import { useUserOrOrg } from "../../shared/use-user-or-org";
import { NotFound } from "../shared/not-found";
import { useEnabledFeatureFlags } from "../shared/use-enabled-feature-flags";
import { EditUserProfileInfoModal } from "./[shortname].page/edit-user-profile-info-modal";
import { ProfilePageContent } from "./[shortname].page/profile-page-content";
import { ProfilePageHeader } from "./[shortname].page/profile-page-header";
import type { ProfilePageTab } from "./[shortname].page/util";
import { parseProfilePageUrlQueryParams } from "./[shortname].page/util";

const ProfilePage: NextPageWithLayout = () => {
  const router = useRouter();
  const { latestEntityTypes } = useLatestEntityTypesOptional();

  const { profileShortname, currentTabTitle } = parseProfilePageUrlQueryParams(
    router.query,
  );

  const [displayEditUserProfileInfoModal, setDisplayEditUserProfileInfoModal] =
    useState(false);

  const { canUserEdit, userOrOrg, userOrOrgSubgraph, loading, refetch } =
    useUserOrOrg({
      shortname: profileShortname,
      graphResolveDepths: {
        // Required to gather the avatar of the user/org (outgoing link), and an org's memberships (incoming links)
        hasLeftEntity: { incoming: 1, outgoing: 1 },
        hasRightEntity: { incoming: 1, outgoing: 1 },
      },
      includePermissions: true,
      temporalAxes: currentTimeInstantTemporalAxes,
    });

  const profile = useMemo(() => {
    if (!userOrOrgSubgraph || !userOrOrg) {
      return undefined;
    }

    if (isEntityUserEntity(userOrOrg)) {
      return constructUser({
        subgraph: userOrOrgSubgraph,
        userEntity: userOrOrg,
      });
    } else {
      return constructOrg({
        orgEntity: userOrOrg,
        subgraph: userOrOrgSubgraph,
      });
    }
  }, [userOrOrgSubgraph, userOrOrg]);

  const profileWebId =
    profile?.kind === "org" ? profile.webId : profile?.accountId;

  const { data: entityTypesData, loading: entityTypesLoading } = useQuery<
    QueryEntityTypesQuery,
    QueryEntityTypesQueryVariables
  >(queryEntityTypesQuery, {
    fetchPolicy: "cache-and-network",
    variables: {
      filter: {
        equal: [
          {
            path: ["webId"],
          },
          { parameter: profileWebId! },
        ],
      },
      ...zeroedGraphResolveDepths,
      includeArchived: true,
      latestOnly: true,
    },
    skip: !profileWebId,
  });

  const { data: propertyTypesData, loading: propertyTypesLoading } = useQuery<
    QueryPropertyTypesQuery,
    QueryPropertyTypesQueryVariables
  >(queryPropertyTypesQuery, {
    fetchPolicy: "cache-and-network",
    variables: {
      filter: {
        equal: [
          {
            path: ["webId"],
          },
          { parameter: profileWebId! },
        ],
      },

      latestOnly: true,
      ...zeroedGraphResolveDepths,
      includeArchived: true,
    },
    skip: !profileWebId,
  });

  const { data: dataTypesData, loading: dataTypesLoading } = useQuery<
    QueryDataTypesQuery,
    QueryDataTypesQueryVariables
  >(queryDataTypesQuery, {
    fetchPolicy: "cache-and-network",
    variables: {
      filter: {
        equal: [
          {
            path: ["webId"],
          },
          { parameter: profileWebId! },
        ],
      },
      ...zeroedGraphResolveDepths,
      includeArchived: true,
      latestOnly: true,
    },
    skip: !profileWebId,
  });

  const webTypes = useMemo(() => {
    const types: (
      | PropertyTypeWithMetadata
      | EntityTypeWithMetadata
      | DataTypeWithMetadata
    )[] = [];

    if (propertyTypesData) {
      const propertyTypes = getRoots<PropertyTypeRootType>(
        mapGqlSubgraphFieldsFragmentToSubgraph(
          propertyTypesData.queryPropertyTypes,
        ),
      );

      types.push(...propertyTypes);
    }

    if (entityTypesData) {
      const entityTypes = getRoots<EntityTypeRootType>(
        mapGqlSubgraphFieldsFragmentToSubgraph(
          entityTypesData.queryEntityTypes,
        ),
      );

      types.push(...entityTypes);
    }

    if (dataTypesData) {
      const dataTypes = getRoots<DataTypeRootType>(
        mapGqlSubgraphFieldsFragmentToSubgraph(dataTypesData.queryDataTypes),
      );

      types.push(...dataTypes);
    }

    return types;
  }, [propertyTypesData, entityTypesData, dataTypesData]);

  const profileNotFound = !profile && !loading;

  const enabledFeatureFlags = useEnabledFeatureFlags();

  const pinnedEntityTypeBaseUrls = useMemo<BaseUrl[]>(
    () =>
      [
        enabledFeatureFlags.pages
          ? systemEntityTypes.page.entityTypeBaseUrl
          : [],
        ...(profile?.pinnedEntityTypeBaseUrls ?? []),
      ].flat(),
    [profile, enabledFeatureFlags],
  );

  const baseTabs = useMemo<ProfilePageTab[]>(
    () => [
      ...(enabledFeatureFlags.pages
        ? [
            {
              kind: "profile",
              title: "Profile",
            } as const,
          ]
        : []),
      ...pinnedEntityTypeBaseUrls.map<ProfilePageTab>((entityTypeBaseUrl) => ({
        kind: "pinned-entity-type",
        entityTypeBaseUrl,
      })),
      {
        kind: "types",
        title: "Types",
      },
    ],
    [enabledFeatureFlags.pages, pinnedEntityTypeBaseUrls],
  );

  const includeEntityTypeIds = useMemo(
    () =>
      latestEntityTypes
        ?.filter(({ metadata }) =>
          baseTabs.some(
            (tab) =>
              tab.kind === "pinned-entity-type" &&
              tab.entityTypeBaseUrl === metadata.recordId.baseUrl,
          ),
        )
        .map(({ schema }) => schema.$id),
    [latestEntityTypes, baseTabs],
  );

  const { data: pinnedEntityTypesData } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
    variables: {
      includePermissions: false,
      request: {
        filter: {
          all: [
            {
              any:
                includeEntityTypeIds?.map((entityTypeId) =>
                  generateVersionedUrlMatchingFilter(entityTypeId, {
                    ignoreParents: false,
                  }),
                ) ?? [],
            },
            ...(profile
              ? [
                  {
                    equal: [
                      { path: ["webId"] },
                      {
                        parameter:
                          profile.kind === "org"
                            ? profile.webId
                            : profile.accountId,
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          inheritsFrom: { outgoing: 255 },
          isOfType: { outgoing: 1 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      },
    },
    fetchPolicy: "cache-and-network",
    skip: !profile || !includeEntityTypeIds,
  });

  const entitiesSubgraph = pinnedEntityTypesData
    ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType<HashEntity>>(
        pinnedEntityTypesData.getEntitySubgraph.subgraph,
      )
    : undefined;

  const allPinnedEntities = useMemo(
    () => (entitiesSubgraph ? getRoots(entitiesSubgraph) : undefined),
    [entitiesSubgraph],
  );

  const tabsWithEntities = useMemo(
    () =>
      baseTabs.map((tab) => {
        if (tab.kind === "pinned-entity-type") {
          const entityType = latestEntityTypes?.find(
            ({ metadata }) =>
              metadata.recordId.baseUrl === tab.entityTypeBaseUrl,
          );

          let entityTypeAndDescendants = entityType ? [entityType] : [];
          try {
            entityTypeAndDescendants =
              entityType && entitiesSubgraph
                ? getEntityTypeAndDescendantsById(
                    entitiesSubgraph,
                    entityType.schema.$id,
                  )
                : entityType
                  ? [entityType]
                  : [];
          } catch {
            /**
             * The entity type is not in the subgraph, which might happen if the user has no entities of that type.
             */
          }

          const entityTypeBaseUrls = entityTypeAndDescendants.map(
            ({ schema }) => extractBaseUrl(schema.$id),
          );

          const pluralTitle =
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- we don't want an empty string
            entityType?.schema.titlePlural ||
            (entityType?.schema.title
              ? pluralize(entityType.schema.title)
              : undefined);

          return {
            ...tab,
            entities: allPinnedEntities?.filter(({ metadata }) =>
              metadata.entityTypeIds.some((entityTypeId) =>
                entityTypeBaseUrls.includes(extractBaseUrl(entityTypeId)),
              ),
            ),
            entitiesSubgraph,
            title: entityType?.schema.title,
            pluralTitle,
            entityType,
          };
        }

        return tab;
      }),
    [baseTabs, allPinnedEntities, entitiesSubgraph, latestEntityTypes],
  );

  const refetchProfile = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const currentTab = useMemo(() => {
    const matchingTab = tabsWithEntities.find((tab) =>
      tab.kind === "pinned-entity-type"
        ? tab.pluralTitle === currentTabTitle
        : tab.title === currentTabTitle,
    );

    if (!matchingTab) {
      return tabsWithEntities[0]!;
    }
    return matchingTab;
  }, [tabsWithEntities, currentTabTitle]);

  if (
    entitiesSubgraph &&
    currentTab.kind === "profile" &&
    profile &&
    router.asPath !== `/@${profile.shortname}`
  ) {
    void router.push(`/@${profile.shortname}`);
  }

  return profileNotFound ? (
    <NotFound resourceLabel={{ label: "profile", withArticle: "a profile" }} />
  ) : (
    <>
      <ProfilePageHeader
        profile={profile}
        isEditable={canUserEdit}
        setDisplayEditUserProfileInfoModal={setDisplayEditUserProfileInfoModal}
        tabs={tabsWithEntities}
        currentTab={currentTab}
        refetchProfile={refetchProfile}
        typesCount={webTypes.length}
      />
      <ProfilePageContent
        profile={profile}
        isEditable={canUserEdit}
        refetchProfile={refetchProfile}
        setDisplayEditUserProfileInfoModal={setDisplayEditUserProfileInfoModal}
        currentTab={currentTab}
        webTypes={webTypes}
        webTypesLoading={
          entityTypesLoading || propertyTypesLoading || dataTypesLoading
        }
      />
      {profile && profile.kind === "user" ? (
        <EditUserProfileInfoModal
          open={displayEditUserProfileInfoModal}
          onClose={() => setDisplayEditUserProfileInfoModal(false)}
          userProfile={profile}
          refetchUserProfile={refetchProfile}
        />
      ) : undefined}
    </>
  );
};

ProfilePage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default ProfilePage;
