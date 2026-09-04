use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};

use super::{OpenOptions, error::WorldError};
use crate::{
    file::{morton::read::MortonFile, quad::read::QuadFile},
    identity::{BasePosition, Column},
    math::{Bounds2, Vec2},
    salt::lod::stage::WIRE_FRAME,
};

pub struct Geometry {
    bounds: Option<Bounds2>,
    positions: Column<BasePosition, Vec2>,

    spatial_index: QuadFile,
    morton_order: MortonFile,
}

impl Geometry {
    pub(crate) fn open(
        OpenOptions { generation, .. }: OpenOptions<'_>,
    ) -> Result<Self, Report<[WorldError]>> {
        let files = &generation.repository().files;

        let positions = files
            .wire_coordinates
            .open(generation)
            .change_context(WorldError::Open {
                file: files.wire_coordinates.name(),
            });

        let spatial_index = files
            .quad
            .open(generation)
            .change_context(WorldError::Open {
                file: files.quad.name(),
            });

        let morton_order: Result<MortonFile, _> =
            files
                .morton
                .open(generation)
                .change_context(WorldError::Open {
                    file: files.morton.name(),
                });

        let (positions, spatial_index, morton_order) =
            (positions, spatial_index, morton_order).try_collect()?;

        let world = generation.repository().metadata.evidence.lod.world;
        let bounds = (morton_order.count() > 0).then(|| world.image_in(WIRE_FRAME));

        let this = Self {
            bounds,
            positions,
            spatial_index,
            morton_order,
        };

        let mut errors = ReportSink::new_armed();

        if this.positions.len() as u64 != this.morton_order.count() {
            errors.capture(WorldError::GeometryCountMismatch {
                positions: this.positions.len(),
                morton_order: this.morton_order.count(),
            });
        }

        if let Some(root) = this.spatial_index.nodes().first()
            && root.points() as usize != this.positions.len()
        {
            errors.capture(WorldError::SpatialIndexCountMismatch {
                root: root.points(),
                positions: this.positions.len(),
            });
        }

        errors.finish_ok(this)
    }

    pub(crate) fn node_count(&self) -> usize {
        self.positions.len()
    }
}
