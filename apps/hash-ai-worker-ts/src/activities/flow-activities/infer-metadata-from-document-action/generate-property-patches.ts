import type { PropertyProvenance } from "@local/hash-graph-client";
import type { PropertyPatchOperation } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type {
  AcademicPaperProperties,
  DOILinkPropertyValueWithMetadata,
  DOIPropertyValueWithMetadata,
  NumberOfPagesPropertyValueWithMetadata,
  SummaryPropertyValueWithMetadata,
} from "@local/hash-isomorphic-utils/system-types/academicpaper";
import type {
  BookProperties,
  ISBNPropertyValueWithMetadata,
} from "@local/hash-isomorphic-utils/system-types/book";
import type {
  PublicationYearPropertyValueWithMetadata,
  TitlePropertyValueWithMetadata,
  WrittenWorkProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";

import { logger } from "../../shared/activity-logger.js";
import type { DocumentMetadata } from "./get-llm-analysis-of-doc.js";

export const generateDocumentPropertyPatches = (
  documentMetadata: Pick<
    DocumentMetadata,
    | "doi"
    | "doiLink"
    | "isbn"
    | "publishedInYear"
    | "summary"
    | "title"
    | "type"
  > & { numberOfPages: number },
  provenance: PropertyProvenance,
): PropertyPatchOperation[] => {
  const propertyPatches: PropertyPatchOperation[] = [];

  const {
    doi,
    doiLink,
    isbn,
    numberOfPages,
    publishedInYear,
    summary,
    title,
    type,
  } = documentMetadata;

  const numPagesKey =
    "https://hash.ai/@hash/types/property-type/number-of-pages/" satisfies keyof WrittenWorkProperties;

  propertyPatches.push({
    op: "add",
    path: [numPagesKey as BaseUrl],
    property: {
      value: numberOfPages,
      metadata: {
        dataTypeId:
          "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        provenance,
      },
    } satisfies NumberOfPagesPropertyValueWithMetadata,
  });

  const summaryKey =
    "https://hash.ai/@hash/types/property-type/summary/" satisfies keyof WrittenWorkProperties;

  propertyPatches.push({
    op: "add",
    path: [summaryKey as BaseUrl],
    property: {
      value: summary,
      metadata: {
        dataTypeId:
          "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        provenance,
      },
    } satisfies SummaryPropertyValueWithMetadata,
  });

  if (title) {
    const key =
      "https://hash.ai/@hash/types/property-type/title/" satisfies keyof WrittenWorkProperties;

    propertyPatches.push({
      op: "add",
      path: [key as BaseUrl],
      property: {
        value: title,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          provenance,
        },
      } satisfies TitlePropertyValueWithMetadata,
    });
  }

  if (publishedInYear) {
    const key =
      "https://hash.ai/@hash/types/property-type/publication-year/" satisfies keyof WrittenWorkProperties;

    propertyPatches.push({
      op: "add",
      path: [key as BaseUrl],
      property: {
        value: publishedInYear,
        metadata: {
          dataTypeId: "https://hash.ai/@hash/types/data-type/year/v/1",
          provenance,
        },
      } satisfies PublicationYearPropertyValueWithMetadata,
    });
  }

  if (doi) {
    if (type !== "AcademicPaper") {
      logger.warn(
        `DOI of ${doi} was provided for non-academic paper type ${type}, ignoring.`,
      );
    } else {
      const key =
        "https://hash.ai/@hash/types/property-type/doi/" satisfies keyof AcademicPaperProperties;

      propertyPatches.push({
        op: "add",
        path: [key as BaseUrl],
        property: {
          value: doi,
          metadata: {
            dataTypeId: "https://hash.ai/@hash/types/data-type/doi/v/1",
            provenance,
          },
        } satisfies DOIPropertyValueWithMetadata,
      });
    }
  }

  if (doiLink) {
    if (type !== "AcademicPaper") {
      logger.warn(
        `DOI Link of ${doiLink} was provided for non-academic paper type ${type}, ignoring.`,
      );
    } else {
      const key =
        "https://hash.ai/@hash/types/property-type/doi-link/" satisfies keyof AcademicPaperProperties;

      propertyPatches.push({
        op: "add",
        path: [key as BaseUrl],
        property: {
          value: doiLink,
          metadata: {
            dataTypeId: "https://hash.ai/@hash/types/data-type/uri/v/1",
            provenance,
          },
        } satisfies DOILinkPropertyValueWithMetadata,
      });
    }
  }

  if (isbn) {
    if (type !== "Book") {
      logger.warn(
        `ISBN of ${isbn} was provided for non-book type ${type}, ignoring.`,
      );
    } else {
      const key =
        "https://hash.ai/@hash/types/property-type/isbn/" satisfies keyof BookProperties;

      propertyPatches.push({
        op: "add",
        path: [key as BaseUrl],
        property: {
          value: isbn,
          metadata: {
            dataTypeId: "https://hash.ai/@hash/types/data-type/isbn/v/1",
            provenance,
          },
        } satisfies ISBNPropertyValueWithMetadata,
      });
    }
  }

  return propertyPatches;
};
