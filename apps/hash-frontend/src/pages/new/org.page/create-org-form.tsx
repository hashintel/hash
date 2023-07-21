import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";

import {
  CreateOrgMutation,
  CreateOrgMutationVariables,
} from "../../../graphql/api-types.gen";
import { createOrgMutation } from "../../../graphql/queries/knowledge/org.queries";
import { OrgForm, OrgFormData } from "../../shared/org-form";

export const CreateOrgForm = () => {
  const router = useRouter();

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

    void router.push(`/@${orgData.shortname}`);
  };

  return <OrgForm onSubmit={onSubmit} submitLabel="Create organization" />;
};
