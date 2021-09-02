import { useQuery } from "@apollo/client";
import { useState } from "react";
import {
  IsShortnameTakenQuery,
  QueryIsShortnameTakenArgs,
} from "../../graphql/apiTypes.gen";
import { isShortnameTaken as isShortnameTakenQuery } from "../../graphql/queries/user.queries";

export const ALLOWED_SHORTNAME_CHARS = /^[a-zA-Z0-9-_]+$/;

const parseShortnameInput = (input: string) =>
  input.replaceAll(/[^a-zA-Z0-9-_]/g, "");

export const useShortnameInput = () => {
  const [shortname, setShortname] = useState("");

  const isEmpty = shortname === "";

  const isTooLong = shortname.length > 24;
  const isTooShort = shortname.length < 4;

  const isShortnameValid = !isEmpty && !isTooLong && !isTooShort;

  const { data, loading } = useQuery<
    IsShortnameTakenQuery,
    QueryIsShortnameTakenArgs
  >(isShortnameTakenQuery, {
    variables: { shortname },
    skip: !isShortnameValid,
  });

  const isShortnameTaken = data?.isShortnameTaken;

  return {
    shortname,
    setShortname: (updatedShortname: string) =>
      setShortname(parseShortnameInput(updatedShortname)),
    isShortnameValid: isShortnameValid && isShortnameTaken !== true,
    isShortnameTaken,
    isshortnameTakenLoading: loading,
    shortnameErrorMessage: isEmpty
      ? "You must choose a username"
      : isTooLong
      ? "Must be shorter than 24 characters"
      : isTooShort
      ? "Must be at least 4 characters"
      : isShortnameTaken
      ? "This username has already been taken"
      : undefined,
    isShortnameTooShort: isTooShort,
  };
};
