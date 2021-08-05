import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";

import {
  CreatePageMutation,
  CreatePageMutationVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPages } from "../../graphql/queries/account.queries";
import { createPage } from "../../graphql/queries/page.queries";

export const useCreatePage = () => {
  const router = useRouter();

  const [createPageFn, { loading, error }] = useMutation<
    CreatePageMutation,
    CreatePageMutationVariables
  >(createPage, {
    onCompleted: (data) => {
      const { createPage } = data;
      const { metadataId, accountId } = createPage;
      router.push(`/${accountId}/${metadataId}`);
    },
    refetchQueries: ({ data }) => [
      {
        query: getAccountPages,
        variables: { accountId: data.createPage.accountId },
      },
    ],
  });

  return {
    create: createPageFn,
    loading,
    error,
  };
};
