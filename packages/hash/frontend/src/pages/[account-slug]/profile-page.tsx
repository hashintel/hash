import { Typography, Container, Grid, Skeleton } from "@mui/material";
import { Box } from "@mui/system";
import { Avatar } from "@hashintel/hash-design-system";
import { FunctionComponent, useMemo } from "react";
import { useOrgs } from "../../components/hooks/useOrgs";
import { useUsers } from "../../components/hooks/useUsers";

const menuBarHeight = 60;

type ProfilePageProps = { shortname: string };

export const ProfilePage: FunctionComponent<ProfilePageProps> = ({
  shortname,
}) => {
  /**
   * @todo: getting an org or user by their shortname should not be happening
   * client side.
   *
   * @see ...
   */
  const { users, loading: loadingUsers } = useUsers();
  const { orgs, loading: loadingOrgs } = useOrgs();

  const profile = useMemo(() => {
    return [...(users ?? []), ...(orgs ?? [])].find(
      (userOrOrg) => userOrOrg.shortname === shortname,
    );
  }, [shortname, users, orgs]);

  const profileNotFound = !profile && !loadingOrgs && !loadingUsers;

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
                  sx={{
                    /** @todo: add this color to the MUI theme system */
                    color: "#0775E3",
                    fontSize: 20,
                    fontWeight: 600,
                  }}
                >
                  @{profile.shortname}
                </Typography>
              ) : (
                <Skeleton height={30} width={150} />
              )}
            </Grid>
            <Grid item>{/* @todo: implement the profile page bio */}</Grid>
          </Grid>
        </Container>
      </Box>
    </>
  );
};
