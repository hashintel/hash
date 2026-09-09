//! Wire-frame coordinates and spatial indexes for a fitted layout.
//!
//! Coordinate access uses [`BasePosition`], the shared order of the geometry artifacts.

use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};

use super::{OpenOptions, error::WorldError};
use crate::{
    file::{morton::read::MortonFile, quad::read::QuadFile},
    identity::{BasePosition, Column},
    math::{Bounds2, Vec2},
    salt::lod::stage::WIRE_FRAME,
};

/// Fitted coordinates with their world bounds and spatial indexes.
#[derive(Debug)]
pub struct Geometry {
    bounds: Option<Bounds2>,
    positions: Column<BasePosition, Vec2>,

    spatial_index: QuadFile,
    morton_order: MortonFile,
}

impl Geometry {
    /// Opens the geometry artifacts and checks their point counts.
    ///
    /// # Errors
    ///
    /// Returns [`WorldError`] for artifact opening or mismatched point counts.
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

    pub(crate) const fn morton_order(&self) -> &MortonFile {
        &self.morton_order
    }

    pub(crate) const fn spatial_index(&self) -> &QuadFile {
        &self.spatial_index
    }

    /// Returns the tight wire-frame extent of the fitted points, [`None`] when there is none.
    pub(super) const fn bounds(&self) -> Option<Bounds2> {
        self.bounds
    }

    pub(super) fn position(&self, position: BasePosition) -> Option<Vec2> {
        self.positions.view().get(position).copied()
    }

    pub(super) fn node_count(&self) -> usize {
        self.positions.len()
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use super::Geometry;
    use crate::serve2::{
        tests::fixture::{NODES, TamperFixture, retarget_quad_root, secret},
        world::{OpenOptions, error::WorldError},
    };

    /// Open refuses a spatial index root whose point count lies below the wire coordinate
    /// column's, under [`WorldError::SpatialIndexCountMismatch`].
    #[test]
    fn quad_root_subtree_short() {
        let fixture = TamperFixture::publish("geometry-quad-root");
        let positions = usize::try_from(NODES).expect("fixture node counts fit usize");
        let points = u32::try_from(NODES - 1).expect("fixture point counts fit u32");
        let files = &fixture.generation().repository().files;

        let tampered = fixture.tamper(&files.quad.name(), |path| {
            retarget_quad_root(path, points);
        });

        let report = Geometry::open(OpenOptions {
            generation: &tampered,
            secret: &secret(),
        })
        .expect_err("open refuses a root point count below the coordinate column's");

        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::SpatialIndexCountMismatch { root, positions: counted }]
                if *root == points && *counted == positions,
        );
    }
}
