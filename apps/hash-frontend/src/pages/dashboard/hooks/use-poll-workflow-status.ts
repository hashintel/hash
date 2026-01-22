import { useCallback, useEffect, useRef, useState } from "react";

export type WorkflowStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type WorkflowStatusResult = {
  status: WorkflowStatus;
  result?: unknown;
  error?: string;
  progress?: number;
};

type UsePollWorkflowStatusParams = {
  workflowId: string | null;
  pollIntervalMs?: number;
  onComplete?: (result: WorkflowStatusResult) => void;
  onError?: (error: string) => void;
};

export const usePollWorkflowStatus = ({
  workflowId,
  pollIntervalMs = 2000,
  onComplete,
  onError,
}: UsePollWorkflowStatusParams) => {
  const [status, setStatus] = useState<WorkflowStatusResult | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!workflowId) {
      return;
    }

    try {
      // TODO: Replace with actual GraphQL query to get workflow status
      // const { data } = await client.query({
      //   query: GET_WORKFLOW_STATUS,
      //   variables: { workflowId },
      //   fetchPolicy: "network-only",
      // });

      // Mock implementation for now - simulate async call
      await Promise.resolve();
      const mockResult: WorkflowStatusResult = {
        status: "running",
        progress: Math.random() * 100,
      };

      setStatus(mockResult);

      if (mockResult.status === "completed") {
        stopPolling();
        onComplete?.(mockResult);
      } else if (mockResult.status === "failed") {
        stopPolling();
        onError?.(mockResult.error ?? "Workflow failed");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch workflow status";
      setStatus({ status: "failed", error: errorMessage });
      stopPolling();
      onError?.(errorMessage);
    }
  }, [workflowId, stopPolling, onComplete, onError]);

  const startPolling = useCallback(() => {
    if (!workflowId || isPolling) {
      return;
    }

    setIsPolling(true);
    // Fetch immediately
    void fetchStatus();
    // Then poll at interval
    intervalRef.current = setInterval(() => {
      void fetchStatus();
    }, pollIntervalMs);
  }, [workflowId, isPolling, fetchStatus, pollIntervalMs]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Auto-start polling when workflowId is set
  useEffect(() => {
    if (workflowId && !isPolling) {
      startPolling();
    } else if (!workflowId && isPolling) {
      stopPolling();
    }
  }, [workflowId, isPolling, startPolling, stopPolling]);

  return {
    status,
    isPolling,
    startPolling,
    stopPolling,
  };
};
