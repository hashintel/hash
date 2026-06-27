import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { Overview } from "../app-shell/product";
import { fetchGraph } from "../shared/data";
import { ErrorState, LoadingState } from "../shared/load-state";
import { getSupplyChainLayout } from "../shared/supply-chain-layout";
import {
  trackSupplyChainError,
  trackSupplyChainViewed,
} from "../shared/telemetry";
import { useSearchParams } from "../shared/use-search-params";

import type { NextPageWithLayout } from "../../../shared/layout";
import type { GraphData } from "../shared/types";

const loadingH = css({ h: "64" });
const errorPad = css({ px: "6", py: "4" });

const ProductPage: NextPageWithLayout = () => {
  const router = useRouter();
  const productId =
    typeof router.query["product-id"] === "string"
      ? router.query["product-id"]
      : "";

  const [searchParams, setSearchParams] = useSearchParams();
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected step lives in the URL (`?step`) so deep links and reloads survive.
  const selectedStepId = searchParams.get("step") ?? null;
  const setSelectedStepId = useCallback(
    (stepId: string | null) => {
      if (stepId === selectedStepId) {
        return;
      }
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (stepId) {
            next.set("step", stepId);
          } else {
            next.delete("step");
          }
          return next;
        },
        { replace: true },
      );
    },
    [selectedStepId, setSearchParams],
  );

  useEffect(() => {
    if (!productId) {
      return;
    }
    setLoading(true);
    setError(null);
    trackSupplyChainViewed({
      productId,
      route: "/supply-chain/product/[product-id]",
      source: "product_page",
    });
    fetchGraph(productId)
      .then(setGraph)
      .catch((caught) => {
        trackSupplyChainError({
          interaction: "product_graph_fetch_failed",
          productId,
          source: "product_page",
        });
        setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) {
    return (
      <LoadingState message="Loading product data..." className={loadingH} />
    );
  }
  if (error) {
    return <ErrorState message={error} className={errorPad} />;
  }
  if (!graph) {
    return null;
  }

  return (
    <Overview
      graph={graph}
      productId={productId}
      selectedStepId={selectedStepId}
      onStepSelect={setSelectedStepId}
    />
  );
};

ProductPage.getLayout = getSupplyChainLayout;

export default ProductPage;
