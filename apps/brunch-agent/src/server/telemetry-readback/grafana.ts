import {
  chronologyMarker,
  idleTimeoutMarker,
  toChronology,
  toIdleTimeout,
  type LoggedIdleTimeout,
  type LoggedSubmissionChronology,
  type ModelCallSpan,
  type ReadResult,
} from "./shared/records.ts";

type GrafanaConfig = {
  readonly url: string;
  /** Bearer token; a local Grafana with anonymous access needs none. */
  readonly token: string | undefined;
  /** The `service.name` Brunch exports under. */
  readonly service: string;
};

export type TimeWindow = { readonly start: Date; readonly end: Date };

type Datasource = { uid: string; type: string };

type LokiStream = {
  readonly stream: Readonly<Record<string, string>>;
  readonly values: readonly (readonly [string, string])[];
};

type OtlpValue = {
  readonly stringValue?: string;
  readonly intValue?: string | number;
  readonly doubleValue?: number;
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

const lokiLineLimit = 1000;
const tempoTraceLimit = 20;

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

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
const modelCallSpansOf = (
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

/**
 * Reads Brunch's chronology and idle-timeout lines from Loki and its
 * model-call spans from Tempo, through Grafana's datasource proxy, so one
 * URL and one token reach both.
 */
export const createGrafanaReader = (
  config: GrafanaConfig,
  fetchImpl: typeof fetch = fetch,
) => {
  const origin = new URL(config.url);
  if (
    config.token &&
    origin.protocol !== "https:" &&
    !loopbackHosts.has(origin.hostname)
  )
    throw new Error(
      `GRAFANA_TOKEN is only sent over HTTPS; ${origin.host} needs an https:// URL.`,
    );
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
  const datasource = async (type: string) => {
    datasources ??= get("/api/datasources") as Promise<Datasource[]>;
    const found = (await datasources).find(
      (candidate) => candidate.type === type,
    );
    if (!found) throw new Error(`Grafana has no ${type} datasource.`);
    return found.uid;
  };

  const lokiLines = async (
    marker: string,
    window: TimeWindow,
    submissionId: string | undefined,
  ) => {
    const uid = await datasource("loki");
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
        limit: String(lokiLineLimit),
        direction: "backward",
      },
    )) as { data?: { result?: LokiStream[] } };
    const lines = (body.data?.result ?? []).flatMap(({ stream, values }) =>
      values.map(([at]) => ({ fields: stream, at: isoFromNanoseconds(at) })),
    );
    return { lines, truncated: lines.length >= lokiLineLimit };
  };

  return {
    /** Settled submissions in the window, newest first. */
    chronologies: async (
      window: TimeWindow,
      submissionId?: string,
    ): Promise<ReadResult<LoggedSubmissionChronology>> => {
      const { lines, truncated } = await lokiLines(
        chronologyMarker,
        window,
        submissionId,
      );
      const records = lines.flatMap(({ fields, at }) => {
        const chronology = toChronology(fields, at);
        return chronology === undefined ? [] : [chronology];
      });
      return {
        records: records.toSorted((left, right) =>
          (right.timestamp ?? "").localeCompare(left.timestamp ?? ""),
        ),
        skipped: lines.length - records.length,
        truncated,
      };
    },

    idleTimeouts: async (
      window: TimeWindow,
      submissionId?: string,
    ): Promise<ReadResult<LoggedIdleTimeout>> => {
      const { lines, truncated } = await lokiLines(
        idleTimeoutMarker,
        window,
        submissionId,
      );
      return {
        records: lines.map(({ fields, at }) => toIdleTimeout(fields, at)),
        skipped: 0,
        truncated,
      };
    },

    modelCallSpans: async (
      window: TimeWindow,
      submissionId: string,
    ): Promise<ReadResult<ModelCallSpan>> => {
      const uid = await datasource("tempo");
      const search = (await get(
        `/api/datasources/proxy/uid/${uid}/api/search`,
        {
          q: `{resource.service.name=${quoted(config.service)} && span.flue.submission.id=${quoted(submissionId)}}`,
          start: String(Math.floor(window.start.getTime() / 1000)),
          end: String(Math.ceil(window.end.getTime() / 1000)),
          limit: String(tempoTraceLimit),
        },
      )) as { traces?: readonly { traceID: string }[] };
      const found = search.traces ?? [];
      const traces = await Promise.all(
        found.map(async ({ traceID }) => ({
          traceID,
          trace: (await get(
            `/api/datasources/proxy/uid/${uid}/api/v2/traces/${traceID}`,
          )) as OtlpTrace,
        })),
      );
      return {
        records: traces
          .flatMap(({ traceID, trace }) =>
            modelCallSpansOf(traceID, trace, submissionId),
          )
          .toSorted((left, right) =>
            left.startedAt.localeCompare(right.startedAt),
          ),
        skipped: 0,
        truncated: found.length >= tempoTraceLimit,
      };
    },
  };
};
