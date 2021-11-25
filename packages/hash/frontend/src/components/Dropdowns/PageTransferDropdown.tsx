import { useEffect, useState, VoidFunctionComponent } from "react";
import { useRouter } from "next/router";

import { AccountSelect } from "../layout/PageSidebar/AccountSelect";
import { useMutation } from "@apollo/client";
import { MutationTransferEntityArgs } from "../../graphql/apiTypes.gen";
import { transferEntityMutation } from "../../graphql/queries/entityType.queries";

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
    transferEntity({
      variables: {
        originalAccountId: accountId,
        entityId: pageEntityId,
        newAccountId,
      },
    })
      .then(() => {
        router.replace(`/${newAccountId}/${pageEntityId}`);
      })
      .catch(console.error);
  };

  return <AccountSelect value={selectedPage} onChange={transferAccount} />;
};
