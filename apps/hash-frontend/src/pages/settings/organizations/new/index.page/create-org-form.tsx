import { useMutation } from "@apollo/client/react";
import { useRouter } from "next/router";

import { useOrgs } from "../../../../../components/hooks/use-orgs";
import { createOrgMutation } from "../../../../../graphql/queries/knowledge/org.queries";
import { useAuthenticatedUser } from "../../../../shared/auth-info-context";
import { OrgForm } from "../../shared/org-form";

import type {
  CreateOrgMutation,
  CreateOrgMutationVariables,
} from "../../../../../graphql/api-types.gen";
import type { OrgFormData } from "../../shared/org-form";

export const CreateOrgForm = () => {
  const router = useRouter();

  const { refetch: refetchUser } = useAuthenticatedUser();
  const { refetch: refetchOrgs } = useOrgs();

  const [createOrg] = useMutation<
    CreateOrgMutation,
    CreateOrgMutationVariables
  >(createOrgMutation);

  const onSubmit = async (orgData: OrgFormData) => {
    const { error } = await createOrg({
      variables: orgData,
    });
    if (error) {
      throw new Error(error.message);
    }

    void refetchUser();
    void refetchOrgs();

    void router.push(`/@${orgData.shortname}`);
  };

  return (
    <OrgForm
      onSubmit={onSubmit}
      submitLabel="Create organization"
      autoFocusDisplayName
      readonly={false}
    />
  );
};
