import { useQuery } from "@apollo/client";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  OrgProperties,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Container, Typography } from "@mui/material";
import { useRouter } from "next/router";
import pluralize from "pluralize";
import { useCallback, useMemo, useState } from "react";

import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../graphql/queries/knowledge/entity.queries";
import { constructOrg, constructUser } from "../lib/user-and-org";
import { useEntityTypesContextRequired } from "../shared/entity-types-context/hooks/use-entity-types-context-required";
import { getLayoutWithSidebar, NextPageWithLayout } from "../shared/layout";
import { useUserOrOrg } from "../shared/use-user-or-org";
import { EditUserProfileInfoModal } from "./[shortname].page/edit-user-profile-info-modal";
import { ProfilePageContent } from "./[shortname].page/profile-page-content";
import { ProfilePageHeader } from "./[shortname].page/profile-page-header";
import {
  parseProfilePageUrlQueryParams,
  ProfilePageTab,
} from "./[shortname].page/util";

const ProfilePage: NextPageWithLayout = () => {
  const router = useRouter();
  const { entityTypes } = useEntityTypesContextRequired();

  const { profileShortname, currentTabTitle } = parseProfilePageUrlQueryParams(
    router.query,
  );

  const [displayEditUserProfileInfoModal, setDisplayEditUserProfileInfoModal] =
    useState(false);

  const { canUserEdit, userOrOrg, userOrOrgSubgraph, loading, refetch } =
    useUserOrOrg({
      shortname: profileShortname,
      graphResolveDepths: {
        // Required to retrieve avatars. Will need amending if we want an org's memberships (they are incoming links)
        hasLeftEntity: { incoming: 1, outgoing: 1 },
        hasRightEntity: { incoming: 1, outgoing: 1 },
      },
      includePermissions: true,
      /**
       * We need to obtain all revisions of the user or org entity
       * to determine when the user joined or the org was created.
       */
      temporalAxes: {
        pinned: { axis: "transactionTime", timestamp: null },
        variable: {
          axis: "decisionTime",
          interval: { start: { kind: "unbounded" }, end: null },
        },
      },
    });

  const profile = useMemo(() => {
    if (!userOrOrgSubgraph || !userOrOrg) {
      return undefined;
    }

    if (
      userOrOrg.metadata.entityTypeId === types.entityType.user.entityTypeId
    ) {
      return constructUser({
        subgraph: userOrOrgSubgraph,
        userEntity: userOrOrg as Entity<UserProperties>,
      });
    }

    return constructOrg({
      orgEntity: userOrOrg as Entity<OrgProperties>,
      subgraph: userOrOrgSubgraph,
    });
  }, [userOrOrgSubgraph, userOrOrg]);

  const profileNotFound = !profile && !loading;

  const pinnedEntityTypeBaseUrls = useMemo(
    () => [
      extractBaseUrl(types.entityType.page.entityTypeId),
      ...(profile?.pinnedEntityTypeBaseUrls ?? []),
    ],
    [profile],
  );

  const baseTabs = useMemo<ProfilePageTab[]>(
    () => [
      {
        kind: "profile",
        title: "Profile",
      },
      ...pinnedEntityTypeBaseUrls.map<ProfilePageTab>((entityTypeBaseUrl) => ({
        kind: "pinned-entity-type",
        entityTypeBaseUrl,
      })),
    ],
    [pinnedEntityTypeBaseUrls],
  );

  const includeEntityTypeIds = useMemo(
    () =>
      entityTypes
        ?.filter(({ metadata }) =>
          baseTabs.some(
            (tab) =>
              tab.kind === "pinned-entity-type" &&
              tab.entityTypeBaseUrl === metadata.recordId.baseUrl,
          ),
        )
        .map(({ schema }) => schema.$id),
    [entityTypes, baseTabs],
  );

  const { data: pinnedEntityTypesData } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      includePermissions: false,
      query: {
        filter: {
          all: [
            {
              any:
                includeEntityTypeIds?.map((entityTypeId) =>
                  generateVersionedUrlMatchingFilter(entityTypeId, {
                    ignoreParents: true,
                  }),
                ) ?? [],
            },
            ...(profile
              ? [
                  {
                    equal: [
                      { path: ["ownedById"] },
                      {
                        parameter:
                          profile.kind === "org"
                            ? profile.accountGroupId
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
          isOfType: { outgoing: 1 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    },
    fetchPolicy: "cache-and-network",
    skip: !profile || !includeEntityTypeIds,
  });

  const entitiesSubgraph = pinnedEntityTypesData?.structuralQueryEntities
    .subgraph as Subgraph<EntityRootType> | undefined;

  const allPinnedEntities = useMemo(
    () => (entitiesSubgraph ? getRoots(entitiesSubgraph) : undefined),
    [entitiesSubgraph],
  );

  const tabsWithEntities = useMemo(
    () =>
      baseTabs.map((tab) => {
        if (tab.kind === "pinned-entity-type") {
          const entityType = entityTypes?.find(
            ({ metadata }) =>
              metadata.recordId.baseUrl === tab.entityTypeBaseUrl,
          );

          const title = entityType?.schema.title;

          const pluralTitle = title ? pluralize(title) : undefined;

          return {
            ...tab,
            entities: allPinnedEntities?.filter(
              ({ metadata }) =>
                extractBaseUrl(metadata.entityTypeId) === tab.entityTypeBaseUrl,
            ),
            entitiesSubgraph,
            title: entityType?.schema.title,
            pluralTitle,
            entityType,
          };
        }

        return tab;
      }),
    [baseTabs, allPinnedEntities, entitiesSubgraph, entityTypes],
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
    <Container sx={{ paddingTop: 5 }}>
      <Typography variant="h2">Profile not found</Typography>
    </Container>
  ) : (
    <>
      <ProfilePageHeader
        profile={profile}
        isEditable={canUserEdit}
        setDisplayEditUserProfileInfoModal={setDisplayEditUserProfileInfoModal}
        tabs={tabsWithEntities}
        currentTab={currentTab}
        refetchProfile={refetchProfile}
      />
      <ProfilePageContent
        profile={profile}
        isEditable={canUserEdit}
        refetchProfile={refetchProfile}
        setDisplayEditUserProfileInfoModal={setDisplayEditUserProfileInfoModal}
        currentTab={currentTab}
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
