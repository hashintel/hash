import { useQuery } from "@apollo/client";
import { aggregateEntity } from "@hashintel/hash-shared/queries/entity.queries";
import {
  AggregateEntityQuery,
  AggregateEntityQueryVariables,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";
import { FunctionComponent } from "react";
import { tw } from "twind";
import { Typography } from "@mui/material";
import { generateEntityLabel } from "../../lib/entities";
import { Link } from "../../shared/ui";

type AccountEntityOfTypeListProps = {
  accountId: string;
  entityTypeId: string;
};

export const AccountEntityOfTypeList: FunctionComponent<
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

  const results = data.aggregateEntity.results;

  if (results.length === 0) {
    return <Typography variant="largeTextLabels">None</Typography>;
  }

  return (
    <ul>
      {results.map((entity) => (
        <li className={tw`mb-2`} key={entity.entityId}>
          <Link noLinkStyle href={`/${accountId}/entities/${entity.entityId}`}>
            <a>{generateEntityLabel(entity, entity.entityType.properties)}</a>
          </Link>
        </li>
      ))}
    </ul>
  );
};
