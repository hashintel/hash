import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";

import { useOrgs } from "../../../../../components/hooks/use-orgs";
import type {
  CreateOrgMutation,
  CreateOrgMutationVariables,
} from "../../../../../graphql/api-types.gen";
import { createOrgMutation } from "../../../../../graphql/queries/knowledge/org.queries";
import { useAuthenticatedUser } from "../../../../shared/auth-info-context";
import type { OrgFormData } from "../../shared/org-form";
import { OrgForm } from "../../shared/org-form";

export const CreateOrgForm = () => {
  const router = useRouter();

  const { refetch: refetchUser } = useAuthenticatedUser();
  const { refetch: refetchOrgs } = useOrgs();

  const [createOrg] = useMutation<
    CreateOrgMutation,
    CreateOrgMutationVariables
  >(createOrgMutation);

  const onSubmit = async (orgData: OrgFormData) => {
    const { errors } = await createOrg({
      variables: orgData,
    });
    if (errors?.[0]) {
      throw new Error(errors[0].message);
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
