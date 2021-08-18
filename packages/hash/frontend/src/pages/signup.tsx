import { NextPage } from "next";
import { SignupModal } from "../components/Modals/Signup/SignupModal";

// import { useRouter } from 'next/router'

const SignupPage: NextPage = () => {
  return <SignupModal show={true} />;
};

export default SignupPage;
