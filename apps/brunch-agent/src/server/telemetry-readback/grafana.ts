import { chronologyMarker, idleTimeoutMarker } from "./parse-log-text.ts";
import {
  toIdleTimeout,
  type LoggedIdleTimeout,
  type LoggedSubmissionChronology,
  type LoggedTurnChronology,
  type ModelCallSpan,
} from "./shared/records.ts";

export type GrafanaConfig = {
  readonly url: string;
  /** Bearer token; a local Grafana with anonymous access needs none. */
  readonly token: string | undefined;
  /** The `service.name` Brunch exports under. */
  readonly service: string;
  /** Datasource name or uid; the first of its type when absent. */
  readonly loki?: string;
  readonly tempo?: string;
};

export type TimeWindow = { readonly start: Date; readonly end: Date };

type Datasource = { uid: string; name: string; type: string };

type LokiStream = {
  readonly stream: Readonly<Record<string, string>>;
  readonly values: readonly (readonly [string, string])[];
};

type OtlpValue = {
  readonly stringValue?: string;
  readonly intValue?: string | number;
  readonly doubleValue?: number;
  readonly boolValue?: boolean;
  readonly arrayValue?: { readonly values?: readonly OtlpValue[] };
};

type OtlpSpan = {
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly startTimeUnixNano: string;
  readonly endTimeUnixNano: string;
  readonly status?: { readonly code?: string };
  readonly attributes?: readonly {
    readonly key: string;
    readonly value: OtlpValue;
  }[];
};

type OtlpTrace = {
  readonly trace?: {
    readonly resourceSpans?: readonly {
      readonly scopeSpans?: readonly { readonly spans?: readonly OtlpSpan[] }[];
    }[];
  };
};

/** LogQL and TraceQL both read a JSON string literal as a quoted string. */
const quoted = (value: string): string => JSON.stringify(value);

const nanoseconds = (date: Date): string => `${date.getTime()}000000`;

const isoFromNanoseconds = (value: string): string =>
  new Date(Number(BigInt(value) / 1_000_000n)).toISOString();

const millisecondsBetween = (start: string, end: string): number =>
  Number((BigInt(end) - BigInt(start)) / 1_000_000n);

const attributeValue = (value: OtlpValue): unknown => {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.intValue !== undefined) return Number(value.intValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.boolValue !== undefined) return value.boolValue;
  return value.arrayValue?.values?.map(attributeValue);
};

const attributesOf = (span: OtlpSpan): ReadonlyMap<string, unknown> =>
  new Map(
    (span.attributes ?? []).map(({ key, value }) => [
      key,
      attributeValue(value),
    ]),
  );

const stringAttribute = (
  attributes: ReadonlyMap<string, unknown>,
  key: string,
): string | null => {
  const value = attributes.get(key);
  return typeof value === "string" ? value : null;
};

const numberAttribute = (
  attributes: ReadonlyMap<string, unknown>,
  key: string,
): number | null => {
  const value = attributes.get(key);
  return typeof value === "number" ? value : null;
};

/** The chat spans of one submission, each with the HTTP requests beneath it. */
export const modelCallSpansOf = (
  traceId: string,
  trace: OtlpTrace,
  submissionId: string,
): ModelCallSpan[] => {
  const spans = (trace.trace?.resourceSpans ?? []).flatMap((resource) =>
    (resource.scopeSpans ?? []).flatMap((scope) => scope.spans ?? []),
  );
  return spans
    .map((span) => ({ span, attributes: attributesOf(span) }))
    .filter(
      ({ attributes }) =>
        attributes.get("gen_ai.operation.name") === "chat" &&
        attributes.get("flue.submission.id") === submissionId,
    )
    .map(({ span, attributes }) => {
      const finishReasons = attributes.get("gen_ai.response.finish_reasons");
      return {
        traceId,
        turnId: stringAttribute(attributes, "flue.turn.id"),
        provider: stringAttribute(attributes, "gen_ai.provider.name"),
        requestedModel: stringAttribute(attributes, "gen_ai.request.model"),
        responseModel: stringAttribute(attributes, "gen_ai.response.model"),
        startedAt: isoFromNanoseconds(span.startTimeUnixNano),
        durationMs: millisecondsBetween(
          span.startTimeUnixNano,
          span.endTimeUnixNano,
        ),
        failed: span.status?.code === "STATUS_CODE_ERROR",
        errorType: stringAttribute(attributes, "error.type"),
        finishReasons: Array.isArray(finishReasons)
          ? finishReasons.filter(
              (reason): reason is string => typeof reason === "string",
            )
          : [],
        inputTokens: numberAttribute(attributes, "gen_ai.usage.input_tokens"),
        outputTokens: numberAttribute(attributes, "gen_ai.usage.output_tokens"),
        httpRequests: spans
          .filter((child) => child.parentSpanId === span.spanId)
          .toSorted((left, right) =>
            BigInt(left.startTimeUnixNano) < BigInt(right.startTimeUnixNano)
              ? -1
              : 1,
          )
          .map((child) => ({
            statusCode: numberAttribute(
              attributesOf(child),
              "http.response.status_code",
            ),
            durationMs: millisecondsBetween(
              child.startTimeUnixNano,
              child.endTimeUnixNano,
            ),
          })),
      };
    })
    .toSorted((left, right) => left.startedAt.localeCompare(right.startedAt));
};

const chronologyOf = (
  stream: LokiStream["stream"],
  timestamp: string,
): LoggedSubmissionChronology | undefined => {
  const { submissionId, outcome, turns } = stream;
  if (submissionId === undefined || turns === undefined) return undefined;
  let parsedTurns: unknown;
  try {
    parsedTurns = JSON.parse(turns);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsedTurns)) return undefined;
  return {
    submissionId,
    outcome: outcome as LoggedSubmissionChronology["outcome"],
    turns: parsedTurns as LoggedTurnChronology[],
    timestamp,
  };
};

/**
 * Reads Brunch's chronology and idle-timeout lines from Loki and its
 * model-call spans from Tempo, through Grafana's datasource proxy, so one
 * URL and one token reach both.
 */
export const createGrafanaReader = (
  config: GrafanaConfig,
  fetchImpl: typeof fetch = fetch,
) => {
  const base = config.url.replace(/\/$/, "");
  const get = async (path: string, query?: Record<string, string>) => {
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(query ?? {}))
      url.searchParams.set(key, value);
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
      },
    });
    if (!response.ok)
      throw new Error(
        `Grafana answered ${response.status} for ${url.pathname}`,
      );
    return (await response.json()) as unknown;
  };

  let datasources: Promise<Datasource[]> | undefined;
  const datasource = async (type: string, wanted: string | undefined) => {
    datasources ??= get("/api/datasources") as Promise<Datasource[]>;
    const found = (await datasources).find((candidate) =>
      wanted === undefined
        ? candidate.type === type
        : candidate.uid === wanted || candidate.name === wanted,
    );
    if (!found)
      throw new Error(
        wanted === undefined
          ? `Grafana has no ${type} datasource.`
          : `Grafana has no datasource named or identified as ${wanted}.`,
      );
    return found.uid;
  };

  const lokiLines = async (
    marker: string,
    window: TimeWindow,
    submissionId: string | undefined,
  ): Promise<LokiStream[]> => {
    const uid = await datasource("loki", config.loki);
    const query = `{service_name=${quoted(config.service)}} |= ${quoted(marker)}${
      submissionId === undefined
        ? ""
        : ` | submissionId=${quoted(submissionId)}`
    }`;
    const body = (await get(
      `/api/datasources/proxy/uid/${uid}/loki/api/v1/query_range`,
      {
        query,
        start: nanoseconds(window.start),
        end: nanoseconds(window.end),
        limit: "1000",
        direction: "backward",
      },
    )) as { data?: { result?: LokiStream[] } };
    return body.data?.result ?? [];
  };

  return {
    /** Settled submissions in the window, newest first. */
    chronologies: async (
      window: TimeWindow,
      submissionId?: string,
    ): Promise<LoggedSubmissionChronology[]> =>
      (await lokiLines(chronologyMarker, window, submissionId))
        .flatMap(({ stream, values }) =>
          values.flatMap(([at]) => {
            const chronology = chronologyOf(stream, isoFromNanoseconds(at));
            return chronology === undefined ? [] : [chronology];
          }),
        )
        .toSorted((left, right) =>
          (right.timestamp ?? "").localeCompare(left.timestamp ?? ""),
        ),

    idleTimeouts: async (
      window: TimeWindow,
      submissionId?: string,
    ): Promise<LoggedIdleTimeout[]> =>
      (await lokiLines(idleTimeoutMarker, window, submissionId)).flatMap(
        ({ stream, values }) =>
          values.map(([at]) => toIdleTimeout(stream, isoFromNanoseconds(at))),
      ),

    modelCallSpans: async (
      window: TimeWindow,
      submissionId: string,
    ): Promise<ModelCallSpan[]> => {
      const uid = await datasource("tempo", config.tempo);
      const search = (await get(
        `/api/datasources/proxy/uid/${uid}/api/search`,
        {
          q: `{resource.service.name=${quoted(config.service)} && span.flue.submission.id=${quoted(submissionId)}}`,
          start: String(Math.floor(window.start.getTime() / 1000)),
          end: String(Math.ceil(window.end.getTime() / 1000)),
          limit: "20",
        },
      )) as { traces?: readonly { traceID: string }[] };
      const traces = await Promise.all(
        (search.traces ?? []).map(async ({ traceID }) => ({
          traceID,
          trace: (await get(
            `/api/datasources/proxy/uid/${uid}/api/v2/traces/${traceID}`,
          )) as OtlpTrace,
        })),
      );
      return traces
        .flatMap(({ traceID, trace }) =>
          modelCallSpansOf(traceID, trace, submissionId),
        )
        .toSorted((left, right) =>
          left.startedAt.localeCompare(right.startedAt),
        );
    },
  };
};

export type GrafanaReader = ReturnType<typeof createGrafanaReader>;
