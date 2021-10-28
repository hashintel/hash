import { VoidFunctionComponent } from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client";

import { tw } from "twind";
import { getAccountEntityTypes } from "../../../graphql/queries/account.queries";
import {
  GetAccountEntityTypesQuery,
  GetAccountEntityTypesQueryVariables,
} from "../../../graphql/apiTypes.gen";

import styles from "./PageSidebar.module.scss";
import { Button } from "../../forms/Button";

type AccountEntityTypeListProps = {
  accountId: string;
};

export const AccountEntityTypeList: VoidFunctionComponent<AccountEntityTypeListProps> =
  ({ accountId }) => {
    const { data } = useQuery<
      GetAccountEntityTypesQuery,
      GetAccountEntityTypesQueryVariables
    >(getAccountEntityTypes, {
      variables: { accountId },
    });

    return (
      <div className={styles.SidebarList}>
        {data?.getAccountEntityTypes.map((entityType) => {
          return (
            <div key={entityType.entityId}>
              <Link href={`/${accountId}/types/${entityType.entityId}`}>
                <a>{entityType.properties.title}</a>
              </Link>
            </div>
          );
        })}
        <Link href={`/${accountId}/types/new`}>
          <a className={tw`inline-block hover:border-transparent`}>
            <Button>Create Entity Type</Button>
          </a>
        </Link>
      </div>
    );
  };
