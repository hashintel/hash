import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { sanitizeHref } from "@local/hash-isomorphic-utils/sanitize";
import {
  OrgProperties,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import { Entity } from "@local/hash-subgraph";
import { Container, Typography } from "@mui/material";
import { NextParsedUrlQuery } from "next/dist/server/request-meta";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { constructOrg, constructUser } from "../lib/user-and-org";
import { getLayoutWithSidebar, NextPageWithLayout } from "../shared/layout";
import { Link } from "../shared/ui/link";
import { useUserOrOrg } from "../shared/use-user-or-org";
import { ProfilePageHeader } from "./[shortname].page/profile-page-header";

export const parseProfilePageUrlQueryParams = (
  queryParams: NextParsedUrlQuery | undefined,
) => {
  const paramsShortname = queryParams?.shortname;

  if (!paramsShortname || typeof paramsShortname !== "string") {
    throw new Error("Could not parse `shortname` from query params.");
  }

  const profileShortname = paramsShortname.slice(1);

  return { profileShortname };
};

export const leftColumnWidth = 150;

const ProfilePage: NextPageWithLayout = () => {
  const router = useRouter();

  const { profileShortname } = parseProfilePageUrlQueryParams(router.query);

  const { userOrOrg, userOrOrgSubgraph, loading } = useUserOrOrg({
    shortname: profileShortname,
    graphResolveDepths: {
      // Required to retrieve avatars. Will need amending if we want an org's memberships (they are incoming links)
      hasLeftEntity: { incoming: 1, outgoing: 0 },
      hasRightEntity: { incoming: 0, outgoing: 1 },
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

  const websiteUrl =
    profile && "website" in profile && sanitizeHref(profile.website);

  return profileNotFound ? (
    <Container sx={{ paddingTop: 5 }}>
      <Typography variant="h2">Profile not found</Typography>
    </Container>
  ) : (
    <>
      <ProfilePageHeader profile={profile} />
      <Container>
        {websiteUrl && (
          <Link href={websiteUrl} sx={{ mt: 1 }}>
            {websiteUrl.replace(/^http(s?):\/\//, "").replace(/\/$/, "")}
          </Link>
        )}
      </Container>
    </>
  );
};

ProfilePage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default ProfilePage;
