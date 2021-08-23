import { NextPage } from "next";
import { SignupModal } from "../components/Modals/AuthModal/SignupModal";

const SignupPage: NextPage = () => {
  return <SignupModal show={true} close={() => {}} />;
};

export default SignupPage;
