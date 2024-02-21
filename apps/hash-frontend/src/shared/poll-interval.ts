export const pollInterval = parseInt(
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  process.env.NEXT_PUBLIC_NOTIFICATION_POLL_INTERVAL || "10000",
  10,
);
