import { useApolloClient } from "@apollo/client";
import { useState } from "react";
import {
  IsShortnameTakenQuery,
  QueryIsShortnameTakenArgs,
} from "../../graphql/apiTypes.gen";
import { isShortnameTaken as isShortnameTakenQuery } from "../../graphql/queries/user.queries";

export const useShortnameInput = () => {
  const [loading, setLoading] = useState(false);
  const client = useApolloClient();

  const parseShortnameInput = (input: string) =>
    input.replaceAll(/[^a-zA-Z0-9-_]/g, "");

  const validateShortname = async (shortname?: string) => {
    if (!shortname) {
      return "IS_EMPTY";
    }
    if (shortname.length > 24) {
      return "IS_TOO_LONG";
    }
    if (shortname.length < 4) {
      return "IS_TOO_SHORT";
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

    if (data?.isShortnameTaken) {
      return "IS_TAKEN";
    }

    return true;
  };

  const getShortnameError = (error: string | undefined, isTouched: boolean) => {
    switch (error) {
      case "IS_EMPTY":
        return isTouched && "You must choose a username";
      case "IS_TOO_SHORT":
        return isTouched && "Must be at least 4 characters";
      case "IS_TOO_LONG":
        return "Must be shorter than 24 characters";
      case "IS_TAKEN":
        return "This user has already been taken";
      default:
        return null;
    }
  };

  return {
    validateShortname,
    validateShortnameLoading: loading,
    parseShortnameInput,
    getShortnameError,
  };
};
