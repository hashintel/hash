import { useMutation } from "@apollo/client";
import { useCallback } from "react";

import {
  ArchiveEntityMutation,
  ArchiveEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import { archiveEntityMutation } from "../../../../graphql/queries/knowledge/entity.queries";
import { ArchiveEntityMessageCallback } from "./knowledge-shim";

export const useBlockProtocolArchiveEntity = (
  readonly?: boolean,
): {
  archiveEntity: ArchiveEntityMessageCallback;
} => {
  const [archiveEntityFn] = useMutation<
    ArchiveEntityMutation,
    ArchiveEntityMutationVariables
  >(archiveEntityMutation, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const archiveEntity: ArchiveEntityMessageCallback = useCallback(
    async ({ data }) => {
      if (readonly) {
        return {
          errors: [
            {
              code: "FORBIDDEN",
              message: "Operation can't be carried out in readonly mode",
            },
          ],
        };
      }

      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for archiveEntity",
            },
          ],
        };
      }

      const { entityId } = data;

      await archiveEntityFn({ variables: { entityId } });

      return { data: true };
    },
    [archiveEntityFn, readonly],
  );

  return { archiveEntity };
};
