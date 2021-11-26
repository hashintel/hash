import { useQuery } from "@apollo/client";
import { aggregateEntity } from "@hashintel/hash-shared/queries/entity.queries";
import {
  AggregateEntityQuery,
  AggregateEntityQueryVariables,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";
import { VoidFunctionComponent } from "react";
import Link from "next/link";
import { tw } from "twind";
import { entityName } from "../../lib/entities";

type AccountEntityOfTypeListProps = {
  accountId: string;
  entityTypeId: string;
};

export const AccountEntityOfTypeList: VoidFunctionComponent<AccountEntityOfTypeListProps> =
  ({ accountId, entityTypeId }) => {
    const { data, loading } = useQuery<
      AggregateEntityQuery,
      AggregateEntityQueryVariables
    >(aggregateEntity, {
      variables: {
        accountId,
        entityTypeId,
        operation: {
          itemsPerPage: 100, // @todo paginate properly
        },
      },
    });

    if (loading) {
      return <em>Loading...</em>;
    }

    if (!data) {
      return null;
    }

    return (
      <ul>
        {data.aggregateEntity.results.map((entity) => (
          <li className={tw`mb-2`} key={entity.entityId}>
            <Link href={`/${accountId}/entities/${entity.entityId}`}>
              <a>{entityName(entity)}</a>
            </Link>
          </li>
        ))}
      </ul>
    );
  };
