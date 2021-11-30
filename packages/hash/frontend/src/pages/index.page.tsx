import { useRouter } from "next/router";

import { useUser } from "../components/hooks/useUser";
import { LoginModal } from "../components/Modals/AuthModal/LoginModal";

export default function Home() {
  const router = useRouter();
  const { user, refetch } = useUser();

  if (user) {
    // Temporarily redirect logged in user to their account page
    void router.push(`/${user.accountId}`);
  }

  return (
    <LoginModal
      show
      onLoggedIn={() => {
        void refetch();
      }}
    />
  );
}
