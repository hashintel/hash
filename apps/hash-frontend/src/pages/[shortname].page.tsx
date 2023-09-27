import { Avatar } from "@hashintel/design-system";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { sanitizeHref } from "@local/hash-isomorphic-utils/sanitize";
import {
  OrgProperties,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import { Entity } from "@local/hash-subgraph";
import { Box, Container, Grid, Skeleton, Typography } from "@mui/material";
import { NextParsedUrlQuery } from "next/dist/server/request-meta";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { constructOrg, constructUser } from "../lib/user-and-org";
import { getLayoutWithSidebar, NextPageWithLayout } from "../shared/layout";
import { Link } from "../shared/ui/link";
import { useUserOrOrg } from "../shared/use-user-or-org";
import { getImageUrlFromEntityProperties } from "./[shortname]/entities/[entity-uuid].page/entity-editor/shared/get-image-url-from-properties";

const menuBarHeight = 60;

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

const Page: NextPageWithLayout = () => {
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

  const avatarSrc = profile?.hasAvatar
    ? getImageUrlFromEntityProperties(profile.hasAvatar.imageEntity.properties)
    : undefined;

  return profileNotFound ? (
    <Container sx={{ paddingTop: 5 }}>
      <Typography variant="h2">Profile not found</Typography>
    </Container>
  ) : (
    <>
      <Box height={menuBarHeight}>{/* @todo: implement the menu-bar */}</Box>
      <Box
        bgcolor={({ palette }) => palette.gray[10]}
        height={`calc(100% - ${menuBarHeight}px)`}
      >
        <Container>
          <Grid container columnSpacing={5} sx={{ marginTop: 0 }}>
            <Grid item md={3}>
              <Box sx={{ position: "relative", top: -15 }}>
                <Avatar
                  bgcolor={
                    profile ? undefined : ({ palette }) => palette.gray[20]
                  }
                  src={avatarSrc}
                  title={
                    profile
                      ? profile.kind === "user"
                        ? profile.preferredName
                        : profile.name
                      : undefined
                  }
                  size={225}
                />
              </Box>
              <Box marginBottom={1}>
                {profile ? (
                  <Typography
                    variant="h1"
                    sx={{ fontSize: 30, fontWeight: 800 }}
                  >
                    {profile.kind === "user"
                      ? profile.preferredName
                      : profile.name}
                  </Typography>
                ) : (
                  <Skeleton height={50} width={200} />
                )}
              </Box>
              {profile ? (
                <Typography
                  sx={({ palette }) => ({
                    color: palette.blue[70],
                    fontSize: 20,
                    fontWeight: 600,
                  })}
                >
                  @{profile.shortname}
                </Typography>
              ) : (
                <Skeleton height={30} width={150} />
              )}
              {websiteUrl && (
                <Link href={websiteUrl} sx={{ mt: 1 }}>
                  {websiteUrl.replace(/^http(s?):\/\//, "").replace(/\/$/, "")}
                </Link>
              )}
            </Grid>
            <Grid item>{/* @todo: implement the profile page bio */}</Grid>
          </Grid>
        </Container>
      </Box>
    </>
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
