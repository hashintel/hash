/**
 * Reads documents written before a component was called a component. Such a
 * document lists its components under `subnets`, and an instance names a
 * component of the document with `subnetId`. Nothing writes these keys: this
 * module is the one place that knows them.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `items` itself when no item changes, so a current document is returned as it is. */
const mapUnlessUnchanged = (
  items: unknown[],
  mapItem: (item: unknown) => unknown,
): unknown[] => {
  const mapped = items.map(mapItem);
  return mapped.every((item, index) => item === items[index]) ? items : mapped;
};

/** `subnetId` becomes `component: { id }`, unless the instance names a component already. */
const migrateInstance = (instance: unknown): unknown => {
  if (!isRecord(instance) || typeof instance.subnetId !== "string") {
    return instance;
  }
  const { subnetId, ...rest } = instance;
  return { component: { id: subnetId }, ...rest };
};

const migrateInstancesOf = (net: unknown): unknown => {
  if (!isRecord(net) || !Array.isArray(net.componentInstances)) {
    return net;
  }
  const componentInstances = mapUnlessUnchanged(
    net.componentInstances,
    migrateInstance,
  );
  return componentInstances === net.componentInstances
    ? net
    : { ...net, componentInstances };
};

/**
 * Brings a document written with `subnets` and `subnetId` to the current
 * shape: `components`, and `component: { id }` on the instances of the root
 * net and of each component. Takes whatever was stored or parsed, so it reads
 * no more of the shape than these keys. Returns a current document itself.
 */
export const migrateLegacyComponentKeys = <Document>(
  document: Document,
): Document => {
  const root = migrateInstancesOf(document);
  if (!isRecord(root)) {
    return document;
  }
  const { subnets, ...rest } = root;
  const listed = rest.components ?? subnets;
  if (!Array.isArray(listed)) {
    return root as Document;
  }
  const components = mapUnlessUnchanged(listed, migrateInstancesOf);
  return subnets === undefined && components === rest.components
    ? (root as Document)
    : ({ ...rest, components } as Document);
};
