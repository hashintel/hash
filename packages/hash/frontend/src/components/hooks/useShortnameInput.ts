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

  const validateShortname = async (shortname: string) => {
    if (shortname === "") {
      return "You must choose a username";
    }
    if (shortname.length > 24) {
      return "Must be shorter than 24 characters";
    }
    if (shortname.length < 4) {
      return "Must be at least 4 characters";
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
      return "This user has already been taken";
    }

    return true;
  };

  return {
    validateShortname,
    validateShortnameLoading: loading,
    parseShortnameInput,
  };
};
