import {
  getReferencedIdsFromEntityType,
  getReferencedIdsFromPropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";

import { typedValues } from "../../shared/util/typed-object-iter";
import { InitializeContext } from "../context.js";
import { fetchTypeAsJson } from "./traverse/fetch.js";
import {
  isDataType,
  isEntityType,
  isPropertyType,
} from "./traverse/type-validation.js";

/** A simple helper method which saves some duplication below, and avoids intermediary array allocations */
const nestedForEach = <T>(arrays: T[][], callback: (ele: T) => void) => {
  for (const array of arrays) {
    for (const element of array) {
      callback(element);
    }
  }
};

/**
 * Keeps track of types to explore, types that have been explored, and their resolved dependency graph as its explored.
 */
class TraversalContext {
  initialContext: InitializeContext;

  exploreQueue: Set<VersionedUrl>;
  explored: Set<VersionedUrl>;

  constructor(initialContext: InitializeContext) {
    this.initialContext = initialContext;

    this.explored = new Set();
    this.exploreQueue = new Set();

    for (const { sourceTypeIds } of typedValues(
      initialContext.parameters.targets,
    )) {
      for (const typeId of sourceTypeIds) {
        initialContext.logTrace(`Adding ${typeId} to explore queue.`);
        this.exploreQueue.add(typeId);
      }
    }
  }

  /**
   * This handles the necessary logic when encountering a type during traversal.
   *
   * If the type has been encountered and resolved before, this updates the relevant references to it, otherwise it
   * adds it to the explore queue for continued traversal.
   *
   * @param sourceTypeId
   * @param dependencyTypeId
   */
  encounter(sourceTypeId: VersionedUrl, dependencyTypeId: VersionedUrl) {
    if (
      !this.explored.has(dependencyTypeId) &&
      !this.exploreQueue.has(dependencyTypeId)
    ) {
      this.initialContext.logTrace(
        `Adding ${dependencyTypeId} to explore queue, as it was encountered as a dependency of ${sourceTypeId}.`,
      );
      this.exploreQueue.add(dependencyTypeId);
    } else {
      this.initialContext.logTrace(
        `Skipping ${dependencyTypeId} as a dependency of ${sourceTypeId}, as it has already been explored.`,
      );
    }

    this.initialContext.typeDependencyMap.addDependencyForType(
      sourceTypeId,
      dependencyTypeId,
    );
  }

  /**
   * This indicates the next type to explore, if there is one in the queue.
   */
  nextToExplore(): VersionedUrl | undefined {
    const result = this.exploreQueue.values().next();

    if (!result.done) {
      const typeId = result.value;
      this.exploreQueue.delete(typeId);
      this.explored.add(typeId);
    } else {
      return undefined;
    }
  }
}

export const traverseAndCollateSchemas = async (
  initialContext: InitializeContext,
): Promise<void> => {
  const traversalContext = new TraversalContext(initialContext);

  const fetchQueue: Promise<void>[] = [];

  // This is a helper method which adds a fetch promise to the queue, and removes it once it has resolved, this avoids
  // the need to have logic that somehow polls for completed promises (which would require awaiting), or an additional
  // collection.
  const addFetchPromise = (fetchPromise: Promise<void>) => {
    fetchQueue.push(fetchPromise);

    void fetchPromise.then(() => {
      void fetchQueue.splice(fetchQueue.indexOf(fetchPromise), 1);
    });
  };

  // Somewhat concurrent fetch queue, keep exploring as long as there is an in-flight request or there are more to
  // explore
  while (traversalContext.exploreQueue.size > 0 || fetchQueue.length > 0) {
    const typeId = traversalContext.nextToExplore();

    if (!typeId) {
      // wait a bit before checking the loop again
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });

      continue;
    }

    initialContext.logDebug(`Fetching ${typeId}...`);

    // Rewrite the type ID before attempting to fetch it if a
    // `getFetchUrlFromTypeId` function was provided in the parameters
    const rewrittenTypeId = initialContext.parameters.getFetchUrlFromTypeId
      ? initialContext.parameters.getFetchUrlFromTypeId(typeId)
      : typeId;

    addFetchPromise(
      fetchTypeAsJson(rewrittenTypeId).then((type) => {
        if (isDataType(type)) {
          initialContext.addDataType(type);
        } else if (isPropertyType(type)) {
          const {
            constrainsValuesOnDataTypes,
            constrainsPropertiesOnPropertyTypes,
          } = getReferencedIdsFromPropertyType(type);

          nestedForEach(
            [constrainsValuesOnDataTypes, constrainsPropertiesOnPropertyTypes],
            (dependencyTypeId) =>
              traversalContext.encounter(typeId, dependencyTypeId),
          );

          initialContext.addPropertyType(type);
        } else if (isEntityType(type)) {
          const {
            constrainsPropertiesOnPropertyTypes,
            constrainsLinkDestinationsOnEntityTypes,
            constrainsLinksOnEntityTypes,
            inheritsFromEntityTypes,
          } = getReferencedIdsFromEntityType(type);

          nestedForEach(
            [
              constrainsPropertiesOnPropertyTypes,
              constrainsLinkDestinationsOnEntityTypes,
              constrainsLinksOnEntityTypes,
              inheritsFromEntityTypes,
            ],
            (dependencyTypeId) =>
              traversalContext.encounter(typeId, dependencyTypeId),
          );

          initialContext.addEntityType(type);
        } else {
          throw new Error(`Unexpected type, was it malformed? URL: ${typeId}`);
        }
      }),
    );
  }
};
