use super::{geometry::Geometry, node_importance::NodeImportance, node_index::NodeIndex};

pub struct Layout {
    index: NodeIndex,
    importance: NodeImportance,

    geometry: Geometry,
}
