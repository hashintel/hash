export const pollInterval = parseInt(
  process.env.NEXT_PUBLIC_NOTIFICATION_POLL_INTERVAL || "10000",
  10,
);
