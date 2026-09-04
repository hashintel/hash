use error_stack::{Report, TryReportTupleExt as _};

use super::{
    OpenOptions, error::WorldError, geometry::Geometry, node_importance::NodeImportance,
    node_index::NodeIndex,
};

pub(crate) struct Layout {
    index: NodeIndex,
    importance: NodeImportance,

    geometry: Geometry,
}

impl Layout {
    pub(crate) fn open(options: OpenOptions<'_>) -> Result<Self, Report<[WorldError]>> {
        let index = NodeIndex::open(options);
        let importance = NodeImportance::open(options);
        let geometry = Geometry::open(options);

        let (index, importance, geometry) = (index, importance, geometry).try_collect()?;

        Ok(Self {
            index,
            importance,
            geometry,
        })
    }
}
