import { useEffect, useState, VoidFunctionComponent } from "react";
import { useRouter } from "next/router";
import { useMutation } from "@apollo/client";

import { AccountSelect } from "../layout/PageSidebar/AccountSelect";
import { MutationTransferEntityArgs } from "../../graphql/apiTypes.gen";
import { transferEntityMutation } from "../../graphql/queries/entityType.queries";
import { getAccountPages } from "../../graphql/queries/account.queries";

export const PageTransferDropdown: VoidFunctionComponent = () => {
  const router = useRouter();

  const pageEntityId = router.query.pageEntityId as string;
  const accountId = router.query.accountId as string;

  const [selectedPage, setSelectedPage] = useState(accountId);

  useEffect(() => {
    setSelectedPage(accountId);
  }, [accountId]);

  const [transferEntity] = useMutation<MutationTransferEntityArgs>(
    transferEntityMutation,
  );

  const transferAccount = (newAccountId: string) => {
    void transferEntity({
      variables: {
        originalAccountId: accountId,
        entityId: pageEntityId,
        newAccountId,
      },
      refetchQueries: [
        { query: getAccountPages, variables: { accountId } },
        { query: getAccountPages, variables: { accountId: newAccountId } },
      ],
    })
      .then(() => {
        router.replace(`/${newAccountId}/${pageEntityId}`);
      })
      .catch(console.error);
  };

  return <AccountSelect value={selectedPage} onChange={transferAccount} />;
};
