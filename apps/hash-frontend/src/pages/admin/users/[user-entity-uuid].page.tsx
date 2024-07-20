import { useRouter } from "next/router";
import { useCallback, useMemo } from "react";
import type { AccountId } from "@local/hash-graph-types/account";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import type { EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Typography } from "@mui/material";

import {
  constructMinimalUser,
  isEntityUserEntity,
} from "../../../lib/user-and-org";
import type { NextPageWithLayout } from "../../../shared/layout";
import { Link } from "../../../shared/ui";
import { useUserOrOrg } from "../../../shared/use-user-or-org";
import { SettingsPageContainer } from "../../settings/shared/settings-page-container";
import { getAdminLayout } from "../admin-page-layout";

import { BasicInfoSection } from "./basic-info-section";

const AdminUserPage: NextPageWithLayout = () => {
  const router = useRouter();

  const userEntityUuid = router.query["user-entity-uuid"] as
    | AccountId
    | undefined;

  const { userOrOrg, refetch, loading } = useUserOrOrg({
    accountOrAccountGroupId: userEntityUuid,
  });

  const user = useMemo(() => {
    if (!userOrOrg || !isEntityUserEntity(userOrOrg)) {
      return undefined;
    }

    return constructMinimalUser({ userEntity: userOrOrg });
  }, [userOrOrg]);

  const refetchUser = useCallback(async () => {
    const {
      data: {
        getEntitySubgraph: { subgraph: refetchedSubgraph },
      },
    } = await refetch();

    const [rootEntity] = getRoots(
      mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(refetchedSubgraph),
    );

    if (!rootEntity || !isEntityUserEntity(rootEntity)) {
      throw new Error(
        "The refetched user entity subgraph does not contain the user entity.",
      );
    }

    return constructMinimalUser({ userEntity: rootEntity });
  }, [refetch]);

  return user ? (
    <SettingsPageContainer
      sectionLabel={"Basic Information"}
      heading={
        <>
          {user.displayName}{" "}
          <Typography
            component={"span"}
            sx={{
              marginLeft: 2,
              fontSize: 13,
              fontWeight: 700,
              color: ({ palette }) => palette.blue[70],
            }}
          >
            <Link noLinkStyle href={`/@${user.shortname}`}>
              @{user.shortname}
            </Link>
          </Typography>
        </>
      }
    >
      <BasicInfoSection user={user} refetchUser={refetchUser} />
    </SettingsPageContainer>
  ) : loading ? (
    <Typography>Loading...</Typography>
  ) : (
    <Typography>Could not find user</Typography>
  );
};

AdminUserPage.getLayout = (page) => getAdminLayout(page);

export default AdminUserPage;
