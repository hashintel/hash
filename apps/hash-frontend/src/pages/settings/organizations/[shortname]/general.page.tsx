import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { OrganizationProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useRef } from "react";

import { useBlockProtocolUpdateEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { useOrgs } from "../../../../components/hooks/use-orgs";
import { NextPageWithLayout } from "../../../../shared/layout";
import { useUserPermissionsOnEntity } from "../../../../shared/use-user-permissions-on-entity";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { getSettingsLayout } from "../../shared/settings-layout";
import { SettingsPageContainer } from "../../shared/settings-page-container";
import { OrgForm, OrgFormData } from "../shared/org-form";

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
    const updatedProperties: OrganizationProperties = {
      "https://hash.ai/@hash/types/property-type/shortname/": org.shortname,
      "https://hash.ai/@hash/types/property-type/organization-name/":
        orgData.name,
      // @todo this is tedious, either enable TS's exact-optional-property-types or allow 'undefined' as a value in EntityPropertiesObject
      ...(orgData.description
        ? {
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              orgData.description,
          }
        : {}),
      ...(orgData.location
        ? {
            "https://hash.ai/@hash/types/property-type/location/":
              orgData.location,
          }
        : {}),
      ...(orgData.websiteUrl
        ? {
            "https://hash.ai/@hash/types/property-type/website-url/":
              orgData.websiteUrl,
          }
        : {}),
    };

    await updateEntity({
      data: {
        entityId: org.entity.metadata.recordId.entityId,
        entityTypeId: systemEntityTypes.organization.entityTypeId,
        properties: updatedProperties,
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
        heading={org.name}
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
