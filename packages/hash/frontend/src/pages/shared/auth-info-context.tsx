import { useLazyQuery } from "@apollo/client";
import { Subgraph, SubgraphRootTypes } from "@hashintel/hash-subgraph";
import {
  createContext,
  FunctionComponent,
  ReactElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { MeQuery } from "../../graphql/apiTypes.gen";
import { meQuery } from "../../graphql/queries/user.queries";
import { AuthenticatedUser, constructAuthenticatedUser } from "../../lib/user";
import { fetchKratosSession } from "./ory-kratos";

type RefetchAuthInfoFunction = () => Promise<{
  authenticatedUser?: AuthenticatedUser;
}>;

type AuthInfoState = {
  authenticatedUser?: AuthenticatedUser;
  refetch: RefetchAuthInfoFunction;
};

export const AuthInfoContext = createContext<AuthInfoState | undefined>(
  undefined,
);

type AuthInfoProviderProps = {
  initialAuthenticatedUser?: AuthenticatedUser;
  children: ReactElement;
};

export const AuthInfoProvider: FunctionComponent<AuthInfoProviderProps> = ({
  initialAuthenticatedUser,
  children,
}) => {
  const [authenticatedUser, setAuthenticatedUser] = useState<
    AuthenticatedUser | undefined
  >(initialAuthenticatedUser);

  useEffect(() => {
    setAuthenticatedUser(initialAuthenticatedUser);
  }, [initialAuthenticatedUser]);

  const [getMe] = useLazyQuery<MeQuery>(meQuery);

  const refetch = useCallback<RefetchAuthInfoFunction>(async () => {
    const [subgraph, kratosSession] = await Promise.all([
      getMe()
        .then(({ data }) => data?.me)
        .catch(() => undefined),
      fetchKratosSession(),
    ]);

    if (!subgraph || !kratosSession) {
      setAuthenticatedUser(undefined);
      return {};
    }
    const userEntityEditionId = (
      subgraph as Subgraph<SubgraphRootTypes["entity"]>
    ).roots[0]!;

    const latestAuthenticatedUser = constructAuthenticatedUser({
      userEntityEditionId,
      subgraph,
      kratosSession,
    });

    setAuthenticatedUser(latestAuthenticatedUser);

    return {
      authenticatedUser: latestAuthenticatedUser,
    };
  }, [getMe]);

  const value = useMemo(
    () => ({
      authenticatedUser,
      refetch,
    }),
    [authenticatedUser, refetch],
  );

  return (
    <AuthInfoContext.Provider value={value}>
      {children}
    </AuthInfoContext.Provider>
  );
};

export const useAuthInfo = (): AuthInfoState => {
  const authInfo = useContext(AuthInfoContext);

  if (!authInfo) {
    throw new Error(
      "Cannot use auth info because it has not been defined. Verify `useAuthInfo` is being called within a child of the `AuthInfoProvider`.",
    );
  }

  return authInfo;
};

export const useAuthenticatedUser = (): AuthInfoState & {
  authenticatedUser: AuthenticatedUser;
} => {
  const { authenticatedUser, ...remainingAuthInfo } = useAuthInfo();

  if (!authenticatedUser) {
    throw new Error("No authenticated user.");
  }

  return { authenticatedUser, ...remainingAuthInfo };
};
