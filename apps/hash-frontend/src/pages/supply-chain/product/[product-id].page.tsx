import { NextSeo } from "next-seo";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { fetchGraph } from "../shared/data";
import { ErrorState, SupplyChainAppSkeleton } from "../shared/load-state";
import { useRegistry } from "../shared/registry-context";
import { getSupplyChainLayout } from "../shared/supply-chain-layout";
import {
  trackSupplyChainError,
  trackSupplyChainViewed,
} from "../shared/telemetry";
import { useSearchParams } from "../shared/use-search-params";
import { Overview } from "../supply-chain-data-shell/product";

import type { NextPageWithLayout } from "../../../shared/layout";
import type { GraphData } from "../shared/types";

const errorPad = css({ px: "6", py: "4" });

const ProductPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { products } = useRegistry();
  const productId =
    typeof router.query["product-id"] === "string"
      ? router.query["product-id"]
      : "";

  const productName = products.find(
    (product) => product.id === productId,
  )?.name;

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

  return (
    <>
      <NextSeo title={productName ?? "Product"} />
      {loading ? (
        <SupplyChainAppSkeleton />
      ) : error ? (
        <ErrorState message={error} className={errorPad} />
      ) : graph ? (
        <Overview
          graph={graph}
          productId={productId}
          selectedStepId={selectedStepId}
          onStepSelect={setSelectedStepId}
        />
      ) : null}
    </>
  );
};

ProductPage.getLayout = getSupplyChainLayout;

export default ProductPage;
