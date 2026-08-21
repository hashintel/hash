import { STEP_TYPE_LABELS } from "../../shared/categories";

import type { SiteNode, VendorOtifStats } from "../../shared/types";
import type { SiteOpportunity } from "./opportunities";

function searchTerms(query: string): string[] {
  return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

function matchesSearchText(
  terms: string[],
  values: Array<string | null | undefined>,
): boolean {
  if (terms.length === 0) {
    return true;
  }

  const searchableText = values
    .filter((value): value is string => value != null)
    .join(" ")
    .toLocaleLowerCase();

  return terms.every((term) => searchableText.includes(term));
}

function siteNodeMatchesTerms(node: SiteNode, terms: string[]): boolean {
  return matchesSearchText(terms, [
    node.id,
    node.label,
    node.material,
    node.plant,
    node.supplier_id,
    node.supplier_name,
    node.receipt_basis,
    STEP_TYPE_LABELS[node.type],
    ...node.products.flatMap((product) => [product.id, product.name]),
  ]);
}

function opportunityMatchesTerms(
  opportunity: SiteOpportunity,
  terms: string[],
): boolean {
  return matchesSearchText(terms, [
    opportunity.title,
    opportunity.typeLabel,
    opportunity.impactLabel,
    opportunity.impactValue,
    opportunity.evidence,
    STEP_TYPE_LABELS[opportunity.node.type],
    opportunity.node.id,
    opportunity.node.material,
    opportunity.node.plant,
    ...opportunity.products.flatMap((product) => [product.id, product.name]),
  ]);
}

function supplierMatchesTerms(
  supplier: VendorOtifStats,
  terms: string[],
): boolean {
  return matchesSearchText(terms, [
    supplier.vendor_id,
    supplier.vendor_name,
    ...(supplier.materials?.flatMap((material) => [
      material.matnr,
      material.name,
    ]) ?? []),
  ]);
}

interface SiteSearchMatchers {
  siteNode: (node: SiteNode) => boolean;
  opportunity: (opportunity: SiteOpportunity) => boolean;
  supplier: (supplier: VendorOtifStats) => boolean;
}

export function createSiteSearchMatchers(query: string): SiteSearchMatchers {
  const terms = searchTerms(query);
  return {
    siteNode: (node: SiteNode) => siteNodeMatchesTerms(node, terms),
    opportunity: (opportunity: SiteOpportunity) =>
      opportunityMatchesTerms(opportunity, terms),
    supplier: (supplier: VendorOtifStats) =>
      supplierMatchesTerms(supplier, terms),
  };
}

export function siteNodeMatchesSearch(node: SiteNode, query: string): boolean {
  return siteNodeMatchesTerms(node, searchTerms(query));
}

export function supplierMatchesSearch(
  supplier: VendorOtifStats,
  query: string,
): boolean {
  return supplierMatchesTerms(supplier, searchTerms(query));
}
