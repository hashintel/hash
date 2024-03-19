import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import { Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { useUsers } from "../../../components/hooks/use-users";
import type { NextPageWithLayout } from "../../../shared/layout";
import { Link } from "../../../shared/ui";
import { SettingsPageContainer } from "../../settings/shared/settings-page-container";
import { getAdminLayout } from "../admin-page-layout";
import { BasicInfoSection } from "./basic-info-section";

const AdminUserPage: NextPageWithLayout = () => {
  const router = useRouter();

  const { users } = useUsers();

  const user = useMemo(() => {
    const userEntityUuid = router.query["user-entity-uuid"] as
      | string
      | undefined;

    if (!userEntityUuid) {
      return undefined;
    }

    return users?.find(
      ({ entity }) =>
        extractEntityUuidFromEntityId(entity.metadata.recordId.entityId) ===
        userEntityUuid,
    );
  }, [router, users]);

  return user ? (
    <SettingsPageContainer
      heading={
        <>
          {user.displayName}{" "}
          <Typography
            component="span"
            sx={{
              marginLeft: 2,
              fontSize: 13,
              fontWeight: 700,
              color: ({ palette }) => palette.blue[70],
            }}
          >
            <Link href={`/@${user.shortname}`} noLinkStyle>
              @{user.shortname}
            </Link>
          </Typography>
        </>
      }
      sectionLabel="Basic Information"
    >
      <BasicInfoSection user={user} />
    </SettingsPageContainer>
  ) : users ? (
    <Typography>Could not find user</Typography>
  ) : (
    <Typography>Loading...</Typography>
  );
};

AdminUserPage.getLayout = (page) => getAdminLayout(page);

export default AdminUserPage;
