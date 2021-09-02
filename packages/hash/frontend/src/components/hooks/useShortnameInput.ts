import { useQuery } from "@apollo/client";
import { useState } from "react";
import {
  IsShortnameTakenQuery,
  QueryIsShortnameTakenArgs,
} from "../../graphql/apiTypes.gen";
import { isShortnameTaken } from "../../graphql/queries/user.queries";

export const ALLOWED_SHORTNAME_CHARS = /^[a-zA-Z0-9-_]+$/;

const parseShortnameInput = (input: string) =>
  input.replaceAll(/[^a-zA-Z0-9-_]/g, "");

export const useShortnameInput = () => {
  const [shortname, setShortname] = useState("");

  const empty = shortname === "";

  const tooLong = shortname.length > 24;
  const tooShort = shortname.length < 4;

  const shortnameIsValid = !empty && !tooLong && !tooShort;

  const { data, loading } = useQuery<
    IsShortnameTakenQuery,
    QueryIsShortnameTakenArgs
  >(isShortnameTaken, {
    variables: { shortname },
    skip: !shortnameIsValid,
  });

  const shortnameIsTaken = data?.isShortnameTaken;

  return {
    shortname,
    setShortname: (updatedShortname: string) =>
      setShortname(parseShortnameInput(updatedShortname)),
    shortnameIsValid: shortnameIsValid && shortnameIsTaken !== true,
    shortnameIsTaken,
    shortnameIsTakenLoading: loading,
    shortnameErrorMessage: empty
      ? "You must choose a username"
      : tooLong
      ? "Must be shorter than 24 characters"
      : tooShort
      ? "Must be at least 4 characters"
      : shortnameIsTaken
      ? "This username has already been taken"
      : undefined,
    tooLong,
  };
};
