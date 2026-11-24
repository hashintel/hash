import { useEffect, useState, type CSSProperties } from "react";

import {
  runParity,
  type ParityProgress,
  type ParitySettings,
} from "./run-parity";

const tableStyle: CSSProperties = {
  fontSize: 13,
  fontVariantNumeric: "tabular-nums",
  borderCollapse: "collapse",
};
const cellStyle: CSSProperties = {
  textAlign: "left",
  padding: "4px 14px 4px 0",
  borderBottom: "1px solid #e5e7eb",
};

const headers = [
  "measure",
  "frames",
  "cpu ms",
  "gpu ms",
  "mean |Δmean| rel",
  "max |Δmean| rel",
  "final KS",
];

const percent = (fraction: number) => `${(fraction * 100).toFixed(3)}%`;

/**
 * Runs the parity experiment once and shows a row per measure as each model
 * finishes. A model one backend could not run shows that backend's reason in
 * place of the comparison.
 */
export const GpuParityPage = ({ settings }: { settings: ParitySettings }) => {
  const [{ rows, finished }, setProgress] = useState<ParityProgress>({
    rows: [],
    finished: false,
  });

  useEffect(() => {
    const controller = new AbortController();
    void runParity(settings, controller.signal, setProgress);
    return () => controller.abort();
  }, [settings]);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 12, padding: 20 }}
    >
      <table style={tableStyle}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} style={cellStyle}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            "error" in row ? (
              <tr key={row.model}>
                <td style={cellStyle} colSpan={2}>
                  {row.model}
                </td>
                <td style={cellStyle}>{row.cpuMs}</td>
                <td style={cellStyle} colSpan={4}>
                  {row.error}
                </td>
              </tr>
            ) : (
              <tr key={row.model}>
                <td style={cellStyle}>{row.model}</td>
                <td style={cellStyle}>{row.frames}</td>
                <td style={cellStyle}>{row.cpuMs}</td>
                <td style={cellStyle}>{row.gpuMs}</td>
                <td style={cellStyle}>{percent(row.meanRelativeDifference)}</td>
                <td style={cellStyle}>{percent(row.maxRelativeDifference)}</td>
                <td style={cellStyle}>{row.finalKs.toFixed(4)}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      <span style={{ fontSize: 12, color: "#888" }}>
        {settings.runCount} runs, maxTime {settings.maxTime}, dt {settings.dt},
        seed {settings.seed}: {finished ? "done" : "running…"}
      </span>
    </div>
  );
};
