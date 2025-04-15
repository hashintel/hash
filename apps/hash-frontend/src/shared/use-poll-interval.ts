import { useAuthInfo } from "../pages/shared/auth-info-context";

const pollInterval = parseInt(
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  process.env.NEXT_PUBLIC_NOTIFICATION_POLL_INTERVAL || "10000",
  10,
);

export const usePollInterval = () => {
  const authInfo = useAuthInfo();

  if (!authInfo.authenticatedUser?.accountSignupComplete) {
    return 0;
  }

  return pollInterval;
};
