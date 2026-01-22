import type { EntityId } from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";
import type {
  ChartConfig,
  ChartType,
} from "@local/hash-isomorphic-utils/dashboard-types";
import { useCallback, useState } from "react";

export type ConfigStep = "goal" | "query" | "analysis" | "chart" | "complete";

export type ConfigState = {
  step: ConfigStep;
  userGoal: string;
  structuredQuery: Filter | null;
  queryExplanation: string | null;
  sampleData: unknown[] | null;
  pythonScript: string | null;
  chartData: unknown[] | null;
  chartType: ChartType | null;
  chartConfig: ChartConfig | null;
  isLoading: boolean;
  error: string | null;
  workflowId: string | null;
};

const initialState: ConfigState = {
  step: "goal",
  userGoal: "",
  structuredQuery: null,
  queryExplanation: null,
  sampleData: null,
  pythonScript: null,
  chartData: null,
  chartType: null,
  chartConfig: null,
  isLoading: false,
  error: null,
  workflowId: null,
};

type UseDashboardItemConfigParams = {
  itemEntityId: EntityId;
  onComplete?: () => void;
};

export const useDashboardItemConfig = ({
  onComplete,
}: UseDashboardItemConfigParams) => {
  const [state, setState] = useState<ConfigState>(initialState);

  const setStep = useCallback((step: ConfigStep) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  const setUserGoal = useCallback((userGoal: string) => {
    setState((prev) => ({ ...prev, userGoal }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error, isLoading: false }));
  }, []);

  const analyzeData = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // TODO: Call GraphQL mutation to trigger data analysis
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 2000);
      });

      const mockChartData = [
        { name: "Flight AA123", value: 1200 },
        { name: "Flight UA456", value: 1150 },
        { name: "Flight DL789", value: 1100 },
        { name: "Flight SW012", value: 1050 },
        { name: "Flight BA345", value: 1000 },
      ];

      const mockPythonScript = `
import json

# Load entity data
with open('/data/entities.json', 'r') as f:
    data = json.load(f)

# Extract flights and sort by scheduled time
flights = [e for e in data['entities'] if e['entityType'] == 'Flight']
flights.sort(key=lambda x: x['properties'].get('scheduledTime', 0), reverse=True)

# Format for chart
chart_data = [
    {'name': f['properties']['name'], 'value': f['properties']['scheduledTime']}
    for f in flights[:10]
]

print(json.dumps(chart_data))
`;

      setState((prev) => ({
        ...prev,
        pythonScript: mockPythonScript,
        chartData: mockChartData,
        chartType: "bar",
        isLoading: false,
        step: "analysis",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze data");
    }
  }, [setError]);

  const generateQuery = useCallback(async () => {
    if (!state.userGoal) {
      setError("Please enter a goal for this chart");
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // TODO: Call GraphQL mutation to trigger query generation
      // For now, simulate with mock data
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 2000);
      });

      const mockQuery: Filter = {
        all: [
          {
            equal: [{ path: ["type", "title"] }, { parameter: "Flight" }],
          },
        ],
      };

      const mockSampleData = [
        { name: "Flight AA123", scheduledTime: 1200, status: "On Time" },
        { name: "Flight UA456", scheduledTime: 1150, status: "Delayed" },
        { name: "Flight DL789", scheduledTime: 1100, status: "On Time" },
      ];

      setState((prev) => ({
        ...prev,
        structuredQuery: mockQuery,
        queryExplanation:
          "This query retrieves all Flight entities ordered by scheduled time.",
        sampleData: mockSampleData,
        isLoading: false,
        step: "query",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate query");
    }
  }, [state.userGoal, setError]);

  const regenerateQuery = useCallback(async () => {
    await generateQuery();
  }, [generateQuery]);

  const confirmQuery = useCallback(() => {
    setStep("analysis");
    // Trigger analysis generation
    void analyzeData();
  }, [setStep, analyzeData]);

  const regenerateAnalysis = useCallback(async () => {
    await analyzeData();
  }, [analyzeData]);

  const generateChartConfig = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // TODO: Call GraphQL mutation to generate chart config
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1000);
      });

      const mockConfig: ChartConfig = {
        categoryKey: "name",
        series: [{ type: "bar", name: "Scheduled Time", dataKey: "value" }],
        xAxisLabel: "Flight",
        yAxisLabel: "Scheduled Time",
        colors: ["#8884d8"],
        showLegend: false,
        showGrid: true,
        showTooltip: true,
      };

      setState((prev) => ({
        ...prev,
        chartConfig: mockConfig,
        isLoading: false,
      }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate chart config",
      );
    }
  }, [setError]);

  const confirmAnalysis = useCallback(() => {
    setStep("chart");
    // Trigger chart config generation
    void generateChartConfig();
  }, [setStep, generateChartConfig]);

  const setChartType = useCallback((chartType: ChartType) => {
    setState((prev) => ({ ...prev, chartType }));
  }, []);

  const setChartConfig = useCallback((chartConfig: ChartConfig) => {
    setState((prev) => ({ ...prev, chartConfig }));
  }, []);

  const saveConfiguration = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // TODO: Call GraphQL mutation to save the configuration
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 500);
      });

      setState((prev) => ({ ...prev, step: "complete", isLoading: false }));
      onComplete?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save configuration",
      );
    }
  }, [onComplete, setError]);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    state,
    setUserGoal,
    generateQuery,
    regenerateQuery,
    confirmQuery,
    regenerateAnalysis,
    confirmAnalysis,
    setChartType,
    setChartConfig,
    saveConfiguration,
    reset,
  };
};
