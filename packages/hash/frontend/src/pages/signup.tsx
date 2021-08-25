import { NextPage } from "next";
import { SignupModal } from "../components/Modals/AuthModal/SignupModal";
import { useRouter } from "next/router";

const SignupPage: NextPage = () => {
  const router = useRouter();

  return <SignupModal show={true} close={() => {}} />;
};

export default SignupPage;
