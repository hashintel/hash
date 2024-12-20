/// An "edgeless" graph is a graph without any edges.
///
/// These benchmarks are for a datastore where the knowledge-graph component is an edgeless graph,
/// meaning there are no link entities, hence the name "linkless".
///
/// This should be the best case scenario for queries with non-zero link-related depths.
mod entity;
