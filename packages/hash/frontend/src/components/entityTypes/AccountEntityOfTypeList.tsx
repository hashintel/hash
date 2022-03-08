import { useQuery } from "@apollo/client";
import { aggregateEntity } from "@hashintel/hash-shared/queries/entity.queries";
import {
  AggregateEntityQuery,
  AggregateEntityQueryVariables,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";
import { VoidFunctionComponent } from "react";
import { tw } from "twind";
import { entityName } from "../../lib/entities";
import { Link } from "../Link";

type AccountEntityOfTypeListProps = {
  accountId: string;
  entityTypeId: string;
};

export const AccountEntityOfTypeList: VoidFunctionComponent<
  AccountEntityOfTypeListProps
> = ({ accountId, entityTypeId }) => {
  const { data, loading } = useQuery<
    AggregateEntityQuery,
    AggregateEntityQueryVariables
  >(aggregateEntity, {
    variables: {
      accountId,
      operation: {
        entityTypeId,
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
          <Link noLinkStyle href={`/${accountId}/entities/${entity.entityId}`}>
            <a>{entityName(entity)}</a>
          </Link>
        </li>
      ))}
    </ul>
  );
};
