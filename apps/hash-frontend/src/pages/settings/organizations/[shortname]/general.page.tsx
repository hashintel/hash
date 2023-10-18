import { EntityPropertiesObject } from "@blockprotocol/graph";
import { extractBaseUrl } from "@blockprotocol/type-system";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useRef } from "react";

import { useBlockProtocolUpdateEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { useOrgs } from "../../../../components/hooks/use-orgs";
import { NextPageWithLayout } from "../../../../shared/layout";
import { useUserPermissionsOnEntity } from "../../../../shared/use-user-permissions-on-entity";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { getSettingsLayout } from "../../shared/settings-layout";
import { OrgForm, OrgFormData } from "../shared/org-form";
import { OrgSettingsContainer } from "../shared/org-settings-container";

const OrgGeneralSettingsPage: NextPageWithLayout = () => {
  const router = useRouter();

  const topRef = useRef<HTMLSpanElement>(null);

  const { shortname } = router.query as { shortname: string };

  const { updateEntity } = useBlockProtocolUpdateEntity();

  const { authenticatedUser, refetch: refetchUser } = useAuthenticatedUser();
  const { refetch: refetchOrgs } = useOrgs();

  const org = authenticatedUser.memberOf.find(
    ({ org: orgOption }) => orgOption.shortname === shortname,
  )?.org;

  const { userPermissions } = useUserPermissionsOnEntity(org?.entity);

  if (!org) {
    // @todo show a 404 page
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
        entityId: org.entity.metadata.recordId.entityId,
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

    void refetchUser();
    void refetchOrgs();
  };

  return (
    <>
      <NextSeo title={`${org.name} | Settings`} />

      <OrgSettingsContainer
        header={org.name}
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
      </OrgSettingsContainer>
    </>
  );
};

OrgGeneralSettingsPage.getLayout = (page) => getSettingsLayout(page);

export default OrgGeneralSettingsPage;
