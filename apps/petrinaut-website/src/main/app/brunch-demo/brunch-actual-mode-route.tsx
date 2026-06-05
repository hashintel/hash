import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FC,
  type PropsWithChildren,
} from "react";
import { z } from "zod";

import {
  ACTUAL_MODE_TIMELINE_TICK_MS,
  actualModeTransitionFiringSchema,
  calculateGraphLayout,
  createJsonDocHandle,
  layoutNodeDimensions,
  PETRINAUT_EXTENSION_NAMES,
} from "@hashintel/petrinaut-core";
import { ActualModeContext } from "@hashintel/petrinaut/react";
import { Petrinaut, type ViewportAction } from "@hashintel/petrinaut/ui";

import type {
  ActualModeContextValue,
  ActualModeMarking,
  ActualModeTransitionFiring,
  SDCPN,
} from "@hashintel/petrinaut-core";

type AvailableActualModeContextValue = Extract<
  ActualModeContextValue,
  { available: true }
>;

const markingValueSchema = z.union([
  z.number(),
  z.array(z.record(z.string(), z.number())),
]);

const markingSchema = z.record(z.string(), markingValueSchema);

const inputArcSchema = z.object({
  placeId: z.string(),
  weight: z.number(),
  type: z
    .enum(["standard", "read", "inhibitor"])
    .optional()
    .default("standard"),
});

const outputArcSchema = z.object({
  placeId: z.string(),
  weight: z.number(),
});

const placeSchema = z.object({
  id: z.string(),
  name: z.string(),
  colorId: z.string().nullable().optional().default(null),
  dynamicsEnabled: z.boolean().optional().default(false),
  differentialEquationId: z.string().nullable().optional().default(null),
  visualizerCode: z.string().optional(),
  showAsInitialState: z.boolean().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

const transitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  inputArcs: z.array(inputArcSchema),
  outputArcs: z.array(outputArcSchema),
  lambdaType: z
    .enum(["predicate", "stochastic"])
    .optional()
    .default("predicate"),
  lambdaCode: z.string().optional().default(""),
  transitionKernelCode: z.string().optional().default(""),
  x: z.number().optional(),
  y: z.number().optional(),
});

const brunchNetDefinitionSchema = z.object({
  version: z.number().optional().default(1),
  meta: z
    .object({
      generator: z.string().optional(),
      generatorVersion: z.string().optional(),
    })
    .optional(),
  title: z.string().optional().default("Brunch run"),
  places: z.array(placeSchema),
  transitions: z.array(transitionSchema),
  types: z.array(z.unknown()).optional().default([]),
});

type BrunchNetDefinition = z.infer<typeof brunchNetDefinitionSchema>;

type BrunchEndpointResult =
  | { ok: true; endpoint: string; runId?: string }
  | { ok: false; error: string };

const pageStyle: CSSProperties = {
  alignItems: "center",
  background: "#f6f7f8",
  color: "#1f2933",
  display: "flex",
  fontFamily: "Inter, system-ui, sans-serif",
  height: "100vh",
  justifyContent: "center",
  padding: 24,
  width: "100vw",
};

const panelStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d7dce1",
  borderRadius: 8,
  boxShadow: "0 8px 24px rgba(31, 41, 51, 0.08)",
  maxWidth: 560,
  padding: 24,
};

const headingStyle: CSSProperties = {
  fontSize: 20,
  lineHeight: "28px",
  margin: "0 0 8px",
};

const bodyStyle: CSSProperties = {
  color: "#4b5563",
  fontSize: 14,
  lineHeight: "20px",
  margin: "0 0 16px",
};

const linkStyle: CSSProperties = {
  color: "#2563eb",
  fontSize: 14,
  fontWeight: 600,
};

const normalizeEndpoint = (value: string): string => {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error("Brunch endpoint is empty.");
  }

  if (/^https?:\/\//u.test(trimmed)) {
    return new URL(trimmed).toString();
  }

  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::|\/)/u.test(trimmed)) {
    return new URL(`http://${trimmed}`).toString();
  }

  return new URL(trimmed, window.location.href).toString();
};

export const getBrunchEndpointFromLocation = (
  location: Location,
): BrunchEndpointResult => {
  const params = new URLSearchParams(location.search);
  const rawEndpoint =
    params.get("brunch_endpoint") ?? params.get("sse") ?? undefined;

  try {
    if (rawEndpoint) {
      return {
        ok: true,
        endpoint: normalizeEndpoint(rawEndpoint),
        runId: params.get("runId") ?? undefined,
      };
    }

    const rawSearch = location.search.startsWith("?")
      ? location.search.slice(1)
      : location.search;
    const prefix = "brunch_endpoint";

    if (rawSearch.startsWith(prefix)) {
      const endpoint = decodeURIComponent(rawSearch.slice(prefix.length));
      return {
        ok: true,
        endpoint: normalizeEndpoint(endpoint),
        runId: params.get("runId") ?? undefined,
      };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    ok: false,
    error:
      "Missing Brunch stream endpoint. Add ?brunch_endpoint=<url> or ?sse=<url>.",
  };
};

const parseJsonEventData = (event: MessageEvent, label: string): unknown => {
  try {
    return JSON.parse(event.data as string) as unknown;
  } catch (err) {
    throw new Error(
      `${label} frame is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
};

const summarizeZodError = (error: z.ZodError): string =>
  error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join(", ");

const parseDefinitionFrame = (event: MessageEvent): BrunchNetDefinition => {
  const data = parseJsonEventData(event, "definition");
  const candidate =
    typeof data === "object" && data !== null && "definition" in data
      ? (data as { definition: unknown }).definition
      : data;
  const result = brunchNetDefinitionSchema.safeParse(candidate);

  if (!result.success) {
    throw new Error(
      `Invalid Brunch definition frame: ${summarizeZodError(result.error)}`,
    );
  }

  return result.data;
};

const parseMarkingFrame = (event: MessageEvent): ActualModeMarking => {
  const data = parseJsonEventData(event, "initial_state");
  const candidate =
    typeof data === "object" && data !== null && "initialState" in data
      ? (data as { initialState: unknown }).initialState
      : data;
  const result = markingSchema.safeParse(candidate);

  if (!result.success) {
    throw new Error(
      `Invalid Brunch initial_state frame: ${summarizeZodError(result.error)}`,
    );
  }

  return result.data;
};

const parseTransitionFiringFrame = (
  event: MessageEvent,
): ActualModeTransitionFiring => {
  const data = parseJsonEventData(event, "transition_firing");
  const result = actualModeTransitionFiringSchema.safeParse(data);

  if (!result.success) {
    throw new Error(
      `Invalid Brunch transition_firing frame: ${summarizeZodError(
        result.error,
      )}`,
    );
  }

  return result.data;
};

const shouldAutoLayout = (definition: BrunchNetDefinition): boolean => {
  const nodes = [...definition.places, ...definition.transitions];

  if (nodes.some((node) => node.x === undefined || node.y === undefined)) {
    return true;
  }

  return (
    nodes.length > 1 && nodes.every((node) => node.x === 0 && node.y === 0)
  );
};

const toSDCPN = (definition: BrunchNetDefinition): SDCPN => ({
  places: definition.places.map((place) => ({
    id: place.id,
    name: place.name,
    colorId: place.colorId,
    dynamicsEnabled: place.dynamicsEnabled,
    differentialEquationId: place.differentialEquationId,
    visualizerCode: place.visualizerCode,
    showAsInitialState: place.showAsInitialState,
    x: place.x ?? 0,
    y: place.y ?? 0,
  })),
  transitions: definition.transitions.map((transition) => ({
    id: transition.id,
    name: transition.name,
    inputArcs: transition.inputArcs,
    outputArcs: transition.outputArcs,
    lambdaType: transition.lambdaType,
    lambdaCode: transition.lambdaCode,
    transitionKernelCode: transition.transitionKernelCode,
    x: transition.x ?? 0,
    y: transition.y ?? 0,
  })),
  types: [],
  differentialEquations: [],
  parameters: [],
});

const normalizeBrunchDefinition = async (
  definition: BrunchNetDefinition,
): Promise<SDCPN> => {
  const sdcpn = toSDCPN(definition);

  if (!shouldAutoLayout(definition)) {
    return sdcpn;
  }

  const positions = await calculateGraphLayout(sdcpn, layoutNodeDimensions);

  return {
    ...sdcpn,
    places: sdcpn.places.map((place) => ({
      ...place,
      ...positions[place.id],
    })),
    transitions: sdcpn.transitions.map((transition) => ({
      ...transition,
      ...positions[transition.id],
    })),
  };
};

const createLoadingActualModeValue = (
  endpoint: string,
  runId: string | undefined,
): AvailableActualModeContextValue => {
  const now = Date.now();

  return {
    available: true,
    source: {
      kind: "brunch",
      endpoint,
      ...(runId ? { runId } : {}),
    },
    status: "loading",
    title: null,
    definition: null,
    initialState: null,
    transitionFirings: [],
    currentFrameIndex: 0,
    timelineStartedAtMs: now,
    timelineNowMs: now,
    setCurrentFrameIndex: () => {},
    error: null,
  };
};

export const BrunchActualModeProvider: FC<
  PropsWithChildren<{ endpoint: string; runId?: string }>
> = ({ children, endpoint, runId }) => {
  const [value, setValue] = useState<AvailableActualModeContextValue>(() =>
    createLoadingActualModeValue(endpoint, runId),
  );

  const setCurrentFrameIndex = useCallback((frameIndex: number) => {
    setValue((prev) => ({
      ...prev,
      currentFrameIndex: Math.max(0, Math.floor(frameIndex)),
    }));
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setValue((prev) =>
        prev.status === "streaming"
          ? {
              ...prev,
              timelineNowMs: Date.now(),
            }
          : prev,
      );
    }, ACTUAL_MODE_TIMELINE_TICK_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setValue(createLoadingActualModeValue(endpoint, runId));
  }, [endpoint, runId]);

  useEffect(() => {
    let cancelled = false;
    const eventSource = new EventSource(endpoint);

    const setError = (message: string) => {
      if (cancelled) {
        return;
      }

      eventSource.close();
      setValue((prev) => ({
        ...prev,
        status: "error",
        timelineNowMs: Date.now(),
        error: message,
      }));
    };

    const onDefinition = (event: Event) => {
      void (async () => {
        try {
          const definition = parseDefinitionFrame(event as MessageEvent);
          const sdcpn = await normalizeBrunchDefinition(definition);

          if (cancelled) {
            return;
          }

          setValue((prev) => ({
            ...prev,
            status: prev.status === "complete" ? "complete" : "streaming",
            title: definition.title,
            definition: sdcpn,
            timelineNowMs: Date.now(),
            error: null,
          }));
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })();
    };

    const onInitialState = (event: Event) => {
      try {
        const initialState = parseMarkingFrame(event as MessageEvent);
        setValue((prev) => ({
          ...prev,
          status: prev.status === "complete" ? "complete" : "streaming",
          initialState,
          timelineNowMs: Date.now(),
          error: null,
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    const onTransitionFiring = (event: Event) => {
      try {
        const firing = parseTransitionFiringFrame(event as MessageEvent);
        setValue((prev) => ({
          ...prev,
          status: prev.status === "complete" ? "complete" : "streaming",
          transitionFirings: [...prev.transitionFirings, firing],
          timelineNowMs: Date.now(),
          error: null,
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    const onTerminal = () => {
      eventSource.close();
      setValue((prev) => ({
        ...prev,
        status: "complete",
        timelineNowMs: Date.now(),
      }));
    };

    const onError = () => {
      setError("Unable to connect to the Brunch stream endpoint.");
    };

    eventSource.addEventListener("definition", onDefinition);
    eventSource.addEventListener("initial_state", onInitialState);
    eventSource.addEventListener("transition_firing", onTransitionFiring);
    eventSource.addEventListener("terminal", onTerminal);
    eventSource.addEventListener("error", onError);

    return () => {
      cancelled = true;
      eventSource.close();
      eventSource.removeEventListener("definition", onDefinition);
      eventSource.removeEventListener("initial_state", onInitialState);
      eventSource.removeEventListener("transition_firing", onTransitionFiring);
      eventSource.removeEventListener("terminal", onTerminal);
      eventSource.removeEventListener("error", onError);
    };
  }, [endpoint, runId]);

  const contextValue = useMemo<AvailableActualModeContextValue>(
    () => ({
      ...value,
      setCurrentFrameIndex,
    }),
    [setCurrentFrameIndex, value],
  );

  return <ActualModeContext value={contextValue}>{children}</ActualModeContext>;
};

const BrunchStatusPage = ({
  body,
  endpoint,
  title,
}: {
  body: string;
  endpoint?: string;
  title: string;
}) => (
  <div style={pageStyle}>
    <div style={panelStyle}>
      <h1 style={headingStyle}>{title}</h1>
      <p style={bodyStyle}>{body}</p>
      {endpoint ? <p style={bodyStyle}>{endpoint}</p> : null}
      <a href="/" style={linkStyle}>
        Back to Petrinaut
      </a>
    </div>
  </div>
);

const BrunchPetrinaut = ({
  viewportActions,
}: {
  viewportActions: ViewportAction[];
}) => {
  const actualMode = use(ActualModeContext);
  const definition = actualMode.available ? actualMode.definition : null;
  const initialState = actualMode.available ? actualMode.initialState : null;
  const source = actualMode.available ? actualMode.source : null;

  const handle = useMemo(() => {
    if (!definition || !source) {
      return null;
    }

    return createJsonDocHandle({
      id: source.runId ? `brunch-${source.runId}` : "brunch-actual",
      initial: definition,
      capabilities: {
        readonly: true,
        disabledExtensions: PETRINAUT_EXTENSION_NAMES,
      },
      historyLimit: 0,
    });
  }, [definition, source]);

  if (!actualMode.available) {
    return (
      <BrunchStatusPage
        title="Brunch stream unavailable"
        body="Actual mode requires a Brunch stream endpoint."
      />
    );
  }

  if (actualMode.status === "error") {
    return (
      <BrunchStatusPage
        title="Could not load Brunch run"
        body={actualMode.error ?? "The Brunch stream returned an error."}
        endpoint={actualMode.source.endpoint}
      />
    );
  }

  if (!definition || !initialState || !handle) {
    return (
      <BrunchStatusPage
        title="Connecting to Brunch"
        body="Waiting for the Petri net definition and initial state."
        endpoint={actualMode.source.endpoint}
      />
    );
  }

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <Petrinaut
        handle={handle}
        hideNetManagementControls="except-title"
        readonly
        setTitle={() => {}}
        title={
          actualMode.title ??
          (actualMode.source.runId
            ? `Brunch run ${actualMode.source.runId}`
            : "Brunch run")
        }
        viewportActions={viewportActions}
      />
    </div>
  );
};

export const BrunchActualModeRoute = ({
  viewportActions,
}: {
  viewportActions: ViewportAction[];
}) => {
  const endpointResult = getBrunchEndpointFromLocation(window.location);

  if (!endpointResult.ok) {
    return (
      <BrunchStatusPage
        title="Missing Brunch endpoint"
        body={endpointResult.error}
      />
    );
  }

  return (
    <BrunchActualModeProvider
      endpoint={endpointResult.endpoint}
      key={`${endpointResult.endpoint}:${endpointResult.runId ?? ""}`}
      runId={endpointResult.runId}
    >
      <BrunchPetrinaut viewportActions={viewportActions} />
    </BrunchActualModeProvider>
  );
};
