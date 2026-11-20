import { useLazyQuery, useQuery } from "@apollo/client";
import { useCallback, useEffect, useState } from "react";

import {
  generatePluralQuery,
  isGenerationAvailableQuery,
} from "../../../../graphql/queries/generation.queries";

import type {
  GeneratePluralQuery,
  GeneratePluralQueryVariables,
  IsGenerationAvailableQuery,
} from "../../../../graphql/api-types.gen";
import type { Dispatch, SetStateAction } from "react";

/**
 * AI plural suggestion, as on entity type creation: the plural field waits
 * for the first suggestion attempt (made when the name field is left), and
 * stays hands-off once the user has typed their own.
 */
export const usePluralSuggestion = ({
  skip,
  setTitlePlural,
}: {
  /** Editing or read-only: nothing is suggested */
  skip: boolean;
  setTitlePlural: Dispatch<SetStateAction<string>>;
}) => {
  const { data: isGenerationAvailableData } =
    useQuery<IsGenerationAvailableQuery>(isGenerationAvailableQuery, {
      fetchPolicy: "no-cache",
      skip,
    });
  const generationAvailable =
    !!isGenerationAvailableData?.isGenerationAvailable.available;

  const [pluralRequestMade, setPluralRequestMade] = useState(false);
  const [generatePlural, { loading: pluralLoading }] = useLazyQuery<
    GeneratePluralQuery,
    GeneratePluralQueryVariables
  >(generatePluralQuery, { fetchPolicy: "no-cache" });

  const requestPluralSuggestion = useCallback(
    async (singular: string) => {
      setPluralRequestMade(true);
      if (!singular.trim() || !generationAvailable) {
        return;
      }
      const { data } = await generatePlural({
        variables: { singular: singular.trim() },
      });
      const suggestion = data?.generatePlural;
      if (suggestion) {
        // Never clobber a plural the user typed in the meantime
        setTitlePlural((current) => current || suggestion);
      }
    },
    [generationAvailable, generatePlural, setTitlePlural],
  );

  // A blur before the availability query resolves must not count as the
  // attempt — it is held and replayed once availability is known
  const [pendingPluralSingular, setPendingPluralSingular] = useState<
    string | null
  >(null);

  const suggestTitlePlural = (singular: string) => {
    if (!isGenerationAvailableData) {
      setPendingPluralSingular(singular);
      return;
    }
    void requestPluralSuggestion(singular);
  };

  useEffect(() => {
    if (isGenerationAvailableData && pendingPluralSingular !== null) {
      setPendingPluralSingular(null);
      void requestPluralSuggestion(pendingPluralSingular);
    }
  }, [
    isGenerationAvailableData,
    pendingPluralSingular,
    requestPluralSuggestion,
  ]);

  return {
    generationAvailable,
    pluralRequestMade,
    pluralLoading,
    suggestTitlePlural,
  };
};
