import { useApolloClient } from "@apollo/client";
import { useCallback, useState } from "react";

import {
  IsShortnameTakenQuery,
  QueryIsShortnameTakenArgs,
} from "../../graphql/api-types.gen";
import { isShortnameTaken as isShortnameTakenQuery } from "../../graphql/queries/user.queries";

type ShortnameErrorCode =
  | "IS_EMPTY"
  | "IS_TOO_LONG"
  | "IS_TOO_SHORT"
  | "IS_TAKEN";

const getShortnameError = (error: string | undefined, isTouched: boolean) => {
  switch (error) {
    case "IS_EMPTY":
      return isTouched ? "You must choose a username" : null;
    case "IS_TOO_SHORT":
      return isTouched ? "Must be at least 4 characters" : null;
    case "IS_TOO_LONG":
      return "Must be shorter than 24 characters";
    case "IS_TAKEN":
      return "This user has already been taken";
    default:
      return null;
  }
};

const parseShortnameInput = (input: string) =>
  input.replaceAll(/[^a-zA-Z0-9-_]/g, "");

export const useShortnameInput = () => {
  const [loading, setLoading] = useState(false);
  const client = useApolloClient();

  const validateShortname = useCallback(
    async (shortname?: string): Promise<true | ShortnameErrorCode> => {
      if (!shortname) {
        return "IS_EMPTY";
      }
      if (shortname.length > 24) {
        return "IS_TOO_LONG";
      }

      setLoading(true);

      const { data } = await client.query<
        IsShortnameTakenQuery,
        QueryIsShortnameTakenArgs
      >({
        query: isShortnameTakenQuery,
        variables: {
          shortname,
        },
      });

      setLoading(false);

      if (data.isShortnameTaken) {
        return "IS_TAKEN";
      }

      /**
       * Reordering this because we currently have some shortnames with a length less than 4
       * @see https://github.com/hashintel/dev/pull/368#discussion_r759248981
       * In the event we ban all shortnames less than 4, then we can move this check to happen
       * before isShortnameTaken query
       */
      if (shortname.length < 4) {
        return "IS_TOO_SHORT";
      }

      return true;
    },
    [client],
  );

  return {
    validateShortname,
    validateShortnameLoading: loading,
    parseShortnameInput,
    getShortnameError,
  };
};
