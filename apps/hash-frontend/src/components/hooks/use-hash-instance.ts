import { useQuery } from "@apollo/client";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import type { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { HASHInstance } from "@local/hash-isomorphic-utils/system-types/hashinstance";
import { useMemo } from "react";

import type {
  EnabledIntegrations,
  GetHashInstanceSettingsQueryQuery,
  GetHashInstanceSettingsQueryQueryVariables,
} from "../../graphql/api-types.gen";
import { getHashInstanceSettings } from "../../graphql/queries/knowledge/hash-instance.queries";

export const useHashInstance = ({
  skip = false,
}: {
  skip?: boolean;
} = {}): {
  loading: boolean;
  hashInstance?: Simplified<HashEntity<HASHInstance>>;
  isUserAdmin: boolean;
  enabledIntegrations: EnabledIntegrations;
} => {
  const { data, loading } = useQuery<
    GetHashInstanceSettingsQueryQuery,
    GetHashInstanceSettingsQueryQueryVariables
  >(getHashInstanceSettings, {
    fetchPolicy: "cache-and-network",
    skip,
  });

  const { hashInstanceSettings } = data ?? {};

  const hashInstance = useMemo<
    Simplified<HashEntity<HASHInstance>> | undefined
  >(() => {
    if (!hashInstanceSettings) {
      return undefined;
    }

    const deserializedHashInstanceEntity = new HashEntity<HASHInstance>(
      hashInstanceSettings.entity,
    );

    return {
      metadata: deserializedHashInstanceEntity.metadata,
      properties: simplifyProperties(deserializedHashInstanceEntity.properties),
    };
  }, [hashInstanceSettings]);

  return {
    loading,
    hashInstance,
    isUserAdmin: !!hashInstanceSettings?.isUserAdmin,
    enabledIntegrations: hashInstanceSettings?.enabledIntegrations ?? {
      googleSheets: false,
      linear: false,
    },
  };
};
