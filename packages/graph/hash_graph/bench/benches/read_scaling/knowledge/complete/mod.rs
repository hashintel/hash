/// A "complete" graph is a graph where every vertex pair is connected by a unique edge.
///
/// These benchmarks are for a datastore where the knowledge-graph component is a complete graph,
/// meaning that for every two non-link entities, there is a link entity connecting them. There is
/// only one possible graph where every entity links to every other entity, which is `K_3`
/// (3 link entities).
///
/// As such, having every non-link entity connected via a link entity should be a very bad case
/// scenario for queries with non-zero link-related depths. (It's likely not the worst, there may
/// not be a finite academic "worst" case if you allow link entities between link entities)
mod entity;
