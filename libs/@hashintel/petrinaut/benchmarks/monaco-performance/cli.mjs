// What the benchmark scripts share: their `key=value` arguments, the server
// they measure and the median they report.

export const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => argument.split("=")),
);

export const origin = args.origin ?? "http://127.0.0.1:6027";

// `modelUrl=/models/my-net.yaml` measures a net from a file the server
// serves (see `loadModel` in app.tsx); pass `copies=1` with it.
export const modelQuery = args.modelUrl
  ? `modelUrl=${encodeURIComponent(args.modelUrl)}`
  : "model=supply-chain";

/** The lower middle of the numbers among `values`, or 0 when there are none. */
export const median = (values) => {
  const sorted = values
    .filter((value) => typeof value === "number" && !Number.isNaN(value))
    .sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
};
