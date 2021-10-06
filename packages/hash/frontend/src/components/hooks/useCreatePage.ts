import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";

import { createPage } from "@hashintel/hash-shared/queries/page.queries";
import {
  CreatePageMutation,
  CreatePageMutationVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPages } from "../../graphql/queries/account.queries";

export const useCreatePage = () => {
  const router = useRouter();

  const [createPageFn, { loading, error }] = useMutation<
    CreatePageMutation,
    CreatePageMutationVariables
  >(createPage, {
    onCompleted: ({ createPage: createdPage }) => {
      const { metadataId, accountId } = createdPage;
      void router.push(`/${accountId}/${metadataId}`);
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
