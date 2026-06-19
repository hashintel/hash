import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { Overview } from "../../../vct/supply-chain/product";
import { fetchGraph } from "../../../vct/supply-chain/shared/data";
import {
  ErrorState,
  LoadingState,
} from "../../../vct/supply-chain/shared/load-state";
import { useSearchParams } from "../../../vct/supply-chain/shared/use-search-params";
import { getSupplyChainLayout } from "../shared/supply-chain-layout";

import type { NextPageWithLayout } from "../../../shared/layout";
import type { GraphData } from "../../../vct/supply-chain/shared/types";

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
    [setSearchParams],
  );

  useEffect(() => {
    if (!productId) {
      return;
    }
    setLoading(true);
    setError(null);
    fetchGraph(productId)
      .then(setGraph)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : String(caught)),
      )
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
