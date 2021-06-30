import { entities } from "../../../mockData/entities";
import { DbEntity, DbOrg, DbUser } from "../../../types/dbTypes";

export const isNamespace = (
  entity: Record<string, any>
): entity is DbUser | DbOrg =>
  "type" in entity && (entity.type === "User" || entity.type === "Org");

// export const entityNamespaceName = (
//   object: Exclude<DbEntity, DbOrg | DbUser>
// ) => {
//   if (!object.namespaceId) {
//     throw new Error(
//       "Could not determine namespace - object does not have a namespaceid"
//     );
//   }
//   return namespaceNameFromNamespaceId(object.namespaceId);
// };

export const namespaceEntityFromNamespaceId = (namespaceId: string) => {
  const entity = entities.find((entity) => entity.id === namespaceId);

  if (!entity) {
    throw new Error(`Could not find namespace with id ${namespaceId}`);
  } else if (!isNamespace(entity)) {
    throw new Error(`Invalid namespaceId ${namespaceId}`);
  }

  return entity;
};

export const namespaceEntityFromNamespaceName = (namespace: string) => {
  const entity = entities.find((entity) => entity.id === namespace);

  if (!entity) {
    throw new Error(`Could not find namespace with name ${namespace}`);
  } else if (!isNamespace(entity)) {
    throw new Error(`Invalid namespace ${namespace}`);
  }

  return entity;
};

export const namespaceNameFromNamespaceId = (namespaceId: string) => {
  const entity = namespaceEntityFromNamespaceId(namespaceId);
  return entity.shortname;
};

export const namespaceIdFromNamespaceName = (namespace: string) => {
  const entity = namespaceEntityFromNamespaceName(namespace);

  return entity.id;
};
