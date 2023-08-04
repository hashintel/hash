import { EntityPropertiesObject } from "@blockprotocol/graph";
import { extractBaseUrl } from "@blockprotocol/type-system";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { Container, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useRef } from "react";

import { useBlockProtocolUpdateEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../../shared/layout";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { OrgForm, OrgFormData } from "../../../shared/org-form";

const OrgGeneralSettingsPage: NextPageWithLayout = () => {
  const router = useRouter();

  const topRef = useRef<HTMLDivElement>(null);

  const { shortname } = router.query as { shortname: string };

  const { updateEntity } = useBlockProtocolUpdateEntity();

  const { authenticatedUser, refetch } = useAuthenticatedUser();

  const org = authenticatedUser.memberOf.find(
    (orgOption) => orgOption.shortname === shortname,
  );

  if (!org) {
    void router.push("/");
    return null;
  }

  const updateOrg = async (orgData: OrgFormData) => {
    const updatedProperties: EntityPropertiesObject = {
      // @todo this is tedious, either enable TS's exact-optional-property-types or allow 'undefined' as a value in EntityPropertiesObject
      ...(orgData.name
        ? {
            [extractBaseUrl(types.propertyType.orgName.propertyTypeId)]:
              orgData.name,
          }
        : {}),
      ...(orgData.description
        ? {
            [extractBaseUrl(types.propertyType.description.propertyTypeId)]:
              orgData.description,
          }
        : {}),
      ...(orgData.location
        ? {
            [extractBaseUrl(types.propertyType.location.propertyTypeId)]:
              orgData.location,
          }
        : {}),
      ...(orgData.website
        ? {
            [extractBaseUrl(types.propertyType.website.propertyTypeId)]:
              orgData.website,
          }
        : {}),
    };

    await updateEntity({
      data: {
        entityId: org.entityRecordId.entityId,
        entityTypeId: types.entityType.org.entityTypeId,
        properties: {
          // @todo allow partial property updates, or spread the existing entity's properties here
          [extractBaseUrl(types.propertyType.shortname.propertyTypeId)]:
            org.shortname,
          ...updatedProperties,
        },
      },
    });

    topRef.current?.scrollIntoView({ behavior: "smooth" });

    void refetch();
  };

  return (
    <>
      <NextSeo title={`${org.name} | Settings`} />

      <Container sx={{ paddingLeft: 4, mb: 10 }} ref={topRef}>
        <Typography variant="h2" mt={10} mb={4} fontWeight="bold">
          {org.name}
        </Typography>
        <OrgForm
          org={org}
          onSubmit={updateOrg}
          submitLabel="Update workspace profile"
        />
      </Container>
    </>
  );
};

OrgGeneralSettingsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default OrgGeneralSettingsPage;
