import { VersionedUrl } from "@blockprotocol/type-system/slim";

import { mustBeDefined } from "../../shared/util/must-be-defined.js";

type TypeDependencies = {
  typeId: VersionedUrl;
  dependencies: TypeDependencies[];
};

/**
 * We want to map every type to their dependencies, however trying to maintain this as a set of plain `Record`s would be
 * difficult as we'd then have to search inside other `Record`'s to find ones that contain this type to update those as
 * well.
 *
 * This map instead uses a collection of object references to represent the dependency graph, which also gracefully
 * allows us to ignore difficulties of circular dependencies.
 */
export class TypeDependencyMap {
  private readonly dependencyMap: Record<VersionedUrl, TypeDependencies> = {};

  addDependencyForType(typeId: VersionedUrl, dependency: VersionedUrl) {
    this.dependencyMap[dependency] ??= {
      typeId: dependency,
      dependencies: [],
    };

    this.dependencyMap[typeId] ??= { typeId, dependencies: [] };
    this.dependencyMap[typeId]!.dependencies.push(
      this.dependencyMap[dependency]!,
    );
  }

  getDependenciesForType(typeId: VersionedUrl): Set<VersionedUrl> {
    const flattenedDependencies = new Set<VersionedUrl>();

    const dependencyQueue = [this.dependencyMap[typeId]] ?? [];

    while (dependencyQueue.length > 0) {
      const dependencies = mustBeDefined(dependencyQueue.pop());

      if (flattenedDependencies.has(dependencies.typeId)) {
        continue;
      }

      flattenedDependencies.add(dependencies.typeId);
      dependencyQueue.push(...dependencies.dependencies);
    }

    return flattenedDependencies;
  }
}
