import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useRef } from "react";
import { useMutation } from "@apollo/client";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { PropertyPatchOperation } from "@local/hash-graph-types/entity";
import {
  blockProtocolPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { useOrgs } from "../../../../components/hooks/use-orgs";
import type {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import { updateEntityMutation } from "../../../../graphql/queries/knowledge/entity.queries";
import type { NextPageWithLayout } from "../../../../shared/layout";
import { useUserPermissionsOnEntity } from "../../../../shared/use-user-permissions-on-entity";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { getSettingsLayout } from "../../../shared/settings-layout";
import { SettingsPageContainer } from "../../shared/settings-page-container";
import type { OrgForm,OrgFormData  } from "../shared/org-form";

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
            key === "name" || key === "description"
              ? blockProtocolPropertyTypes.name.propertyTypeBaseUrl
              : systemPropertyTypes[key].propertyTypeBaseUrl,
          ],
          op: "add",
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
        heading={org.name}
        sectionLabel={"General"}
        ref={topRef}
      >
        <OrgForm
          key={org.entity.metadata.recordId.entityId}
          org={org}
          readonly={!userPermissions?.edit}
          submitLabel={"Update organization profile"}
          onSubmit={updateOrg}
        />
      </SettingsPageContainer>
    </>
  );
};

OrgGeneralSettingsPage.getLayout = (page) => getSettingsLayout(page);

export default OrgGeneralSettingsPage;
