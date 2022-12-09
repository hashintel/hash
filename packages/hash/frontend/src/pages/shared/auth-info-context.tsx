import {
  createContext,
  FunctionComponent,
  ReactElement,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AuthenticatedUser } from "../../lib/user";

type AuthInfoState = {
  authenticatedUser?: AuthenticatedUser;
};

export const AuthInfoContext = createContext<AuthInfoState>({});

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

  const value = useMemo(
    () => ({
      authenticatedUser,
    }),
    [authenticatedUser],
  );

  return (
    <AuthInfoContext.Provider value={value}>
      {children}
    </AuthInfoContext.Provider>
  );
};

export const useAuthInfo = (): AuthInfoState => {
  const authInfo = useContext(AuthInfoContext);

  return authInfo;
};

export const useAuthenticatedUser = (): {
  authenticatedUser: AuthenticatedUser;
} => {
  const { authenticatedUser } = useAuthInfo();

  if (!authenticatedUser) {
    throw new Error("No authenticated user.");
  }

  return { authenticatedUser };
};
