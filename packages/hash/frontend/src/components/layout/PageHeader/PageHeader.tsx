import { useApolloClient } from "@apollo/client";
import { useState } from "react";
import { VoidFunctionComponent } from "react";
import { tw } from "twind";

import { useUser } from "../../hooks/useUser";
import { LoginModal } from "../../Modals/Login/LoginModal";
import { AccountDropdown } from "./AccountDropdown";

export const PageHeader: VoidFunctionComponent = () => {
  const [user, refetchUser] = useUser();
  const apolloClient = useApolloClient();

  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);

  return (
    <>
      <LoginModal
        show={showLoginModal}
        close={() => setShowLoginModal(false)}
        onLoggedIn={() => {
          refetchUser();
          setShowLoginModal(false);
        }}
      />
      <header className={tw`bg-white py-4 border(b-1 gray-300)`}>
        <nav className={tw`container mx-auto flex justify-end`}>
          {user ? (
            <AccountDropdown
              name={user.properties.shortname}
              onLoggedOut={() =>
                apolloClient.resetStore().then(() => refetchUser())
              }
            />
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className={tw`bg(blue-500 hover:blue-700) text(white visited:white) font-bold border(none hover:none)  py-2 px-5 rounded  no-underline`}
            >
              Sign in
            </button>
          )}
        </nav>
      </header>
    </>
  );
};
