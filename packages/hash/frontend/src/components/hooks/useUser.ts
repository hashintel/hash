import { useContext } from "react";
import { UserContext } from "../contexts/UserContext";

export const useUser = () => {
  const { user, refetch, loading } = useContext(UserContext);

  return { user, refetch, loading };
};
