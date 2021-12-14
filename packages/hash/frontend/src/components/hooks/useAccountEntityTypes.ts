import { useEffect, useState } from "react";
import { BlockProtocolEntityType } from "@hashintel/block-protocol";

import { useBlockProtocolAggregateEntityTypes } from "./blockProtocolFunctions/useBlockProtocolAggregateEntityTypes";

// this is a way of returning entitytypes without adding a different state
export const useAccountEntityTypes = (
  accountId: string,
  includeOtherTypesInUse?: boolean,
) => {
  const [accountEntityTypes, setAccountEntityTypes] = useState<
    BlockProtocolEntityType[] | null
  >(null);

  const { aggregateEntityTypes } =
    useBlockProtocolAggregateEntityTypes(accountId);

  useEffect(() => {
    if (aggregateEntityTypes) {
      aggregateEntityTypes({
        includeOtherTypesInUse: includeOtherTypesInUse ?? false,
      })
        .then((response) => setAccountEntityTypes(response.results))
        .catch((err) =>
          // eslint-disable-next-line no-console -- TODO: consider using logger
          console.error(`Error fetching entity type options: ${err.message}`),
        );
    }
  }, [aggregateEntityTypes]);

  return { accountEntityTypes };
};
