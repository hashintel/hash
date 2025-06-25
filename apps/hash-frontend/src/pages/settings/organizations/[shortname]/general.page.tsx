import { useMutation } from "@apollo/client";
import type { PropertyPatchOperation } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import {
  blockProtocolPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { useTheme } from "@mui/material";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useRef } from "react";

import { useOrgs } from "../../../../components/hooks/use-orgs";
import type {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import { updateEntityMutation } from "../../../../graphql/queries/knowledge/entity.queries";
import type { NextPageWithLayout } from "../../../../shared/layout";
import { Link } from "../../../../shared/ui";
import { useUserPermissionsOnEntity } from "../../../../shared/use-user-permissions-on-entity";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { getSettingsLayout } from "../../../shared/settings-layout";
import { SettingsPageContainer } from "../../shared/settings-page-container";
import type { OrgFormData } from "../shared/org-form";
import { OrgForm } from "../shared/org-form";

const OrgGeneralSettingsPage: NextPageWithLayout = () => {
  const router = useRouter();

  const topRef = useRef<HTMLSpanElement>(null);

  const { shortname } = router.query as { shortname: string };

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const { authenticatedUser, refetch: refetchUser } = useAuthenticatedUser();
  const { refetch: refetchOrgs } = useOrgs();

  const org = authenticatedUser.memberOf.find(
    ({ org: orgOption }) => orgOption.shortname === shortname,
  )?.org;

  const { userPermissions } = useUserPermissionsOnEntity(org?.entity);

  const theme = useTheme();

  if (!org) {
    // @todo show a 404 page
    void router.push("/");
    return null;
  }

  const updateOrg = async (orgData: OrgFormData) => {
    const propertyPatches: PropertyPatchOperation[] = [];
    const { description, location, name, websiteUrl } = orgData;
    for (const [key, value] of typedEntries({
      description,
      location,
      name,
      websiteUrl,
    })) {
      if (typeof value !== "undefined") {
        propertyPatches.push({
          path: [
            key === "name"
              ? systemPropertyTypes.organizationName.propertyTypeBaseUrl
              : key === "description"
                ? blockProtocolPropertyTypes.description.propertyTypeBaseUrl
                : systemPropertyTypes[key].propertyTypeBaseUrl,
          ],
          op:
            key === "websiteUrl" && !value.startsWith("http")
              ? "remove"
              : "add",
          property: {
            value,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        });
      }
    }

    await updateEntity({
      variables: {
        entityUpdate: {
          entityId: org.entity.metadata.recordId.entityId,
          propertyPatches,
        },
      },
    });

    topRef.current?.scrollIntoView({ behavior: "smooth" });

    void refetchUser();
    void refetchOrgs();
  };

  return (
    <>
      <NextSeo title={`${org.name} | Settings`} />

      <SettingsPageContainer
        heading={
          <Link
            href={`/@${org.shortname}`}
            style={{
              color: theme.palette.common.black,
              textDecoration: "none",
            }}
          >
            {org.name}
          </Link>
        }
        sectionLabel="General"
        ref={topRef}
      >
        <OrgForm
          key={org.entity.metadata.recordId.entityId}
          org={org}
          onSubmit={updateOrg}
          readonly={!userPermissions?.edit}
          submitLabel="Update organization profile"
        />
      </SettingsPageContainer>
    </>
  );
};

OrgGeneralSettingsPage.getLayout = (page) => getSettingsLayout(page);

export default OrgGeneralSettingsPage;
