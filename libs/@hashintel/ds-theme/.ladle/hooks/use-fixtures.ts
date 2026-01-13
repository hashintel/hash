/* eslint-disable @typescript-eslint/no-explicit-any */
import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import * as CSV from "papaparse";
import yaml from "yaml";
import type { z } from "zod";

/**
 * simplistic CSV parser (does not handle errors; assumes header row, etc.)
 */
const csvParser = (t: string) =>
  CSV.parse(t, { header: true, dynamicTyping: true })?.data;

/**
 * Load and parse a fixture file with type assertion, or with schema validation
 */
export function useFixture<TSchema extends z.ZodType<any>>(
  path: string,
  schema: TSchema,
): z.infer<TSchema>;
export function useFixture<T = unknown>(path: string): T;
export function useFixture<TSchema extends z.ZodType<any>, T = unknown>(
  path: string,
  schema?: TSchema,
): z.infer<TSchema> | T {
  const isYAML = path.endsWith(".yaml") || path.endsWith(".yml");
  const isCSV = path.endsWith(".csv");
  const isText = isYAML || isCSV;
  const textParser = isYAML ? yaml.parse : csvParser;
  const { data, error } = useSuspenseQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: ["fixture", path],
    queryFn: () =>
      fetch(path, {
        headers: {
          Accept: isText ? "text/plain" : "application/json",
        },
      }).then(async (res) => {
        const parsedData = isText
          ? textParser(await res.text())
          : await res.json();
        // If schema is provided, validate the parsed content
        if (schema) {
          return schema.parse(parsedData);
        }
        return parsedData as T;
      }),
  });
  if (error) throw error;
  return data;
}

// TODO: add schema thing to this?
export function useFixtures<T>(paths: string[]) {
  const queries = useSuspenseQueries({
    queries: paths.map((path) => {
      const isYAML = path.endsWith(".yaml") || path.endsWith(".yml");
      const isCSV = path.endsWith(".csv");
      const isText = isYAML || isCSV;
      const textParser = isYAML ? yaml.parse : csvParser;
      return {
        queryKey: ["fixture", path],
        queryFn: () =>
          fetch(path, {
            headers: {
              Accept: isText ? "text/plain" : "application/json",
            },
          }).then(async (res) => {
            const parsedData = isText
              ? textParser(await res.text())
              : await res.json();
            return parsedData as T;
          }),
      };
    }),
  });
  return (queries ?? []).map(({ error, data }) => {
    if (error) throw error;
    return data;
  });
}
