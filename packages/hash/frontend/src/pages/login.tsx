import { NextPage } from "next";
import { LoginModal } from "../components/Modals/AuthModal/LoginModal";
import { useRouter } from "next/router";

const LoginPage: NextPage = () => {
  const router = useRouter();

  return (
    <LoginModal
      show={true}
      close={() => undefined}
      onLoggedIn={() => router.push("/")}
    />
  );
};

export default LoginPage;
