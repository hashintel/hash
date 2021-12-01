import { useEffect, useState, VoidFunctionComponent } from "react";
import { useRouter } from "next/router";
import { useMutation } from "@apollo/client";

import { AccountSelect } from "../layout/PageSidebar/AccountSelect";
import { MutationTransferEntityArgs } from "../../graphql/apiTypes.gen";
import { transferEntityMutation } from "../../graphql/queries/entityType.queries";
import { getAccountPages } from "../../graphql/queries/account.queries";

type PageTransferDropdownType = {
  pageEntityId: string;
  accountId: string;
  setPageState: (state: "normal" | "transferring") => void;
};

const PageTransferDropdown: VoidFunctionComponent<
  PageTransferDropdownType
> = ({ pageEntityId, accountId, setPageState }) => {
  const router = useRouter();

  const [selectedAccountId, setSelectedAccountId] = useState(accountId);

  useEffect(() => {
    setSelectedAccountId(accountId);
  }, [accountId]);

  const [transferEntity] = useMutation<MutationTransferEntityArgs>(
    transferEntityMutation,
  );

  const transferAccount = (newAccountId: string) => {
    setPageState("transferring");

    transferEntity({
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
        return router.replace(`/${newAccountId}/${pageEntityId}`);
      })
      .catch((err) => {
        console.error(err);
        setPageState("normal");
      });
  };

  return <AccountSelect value={selectedAccountId} onChange={transferAccount} />;
};

export default PageTransferDropdown;
