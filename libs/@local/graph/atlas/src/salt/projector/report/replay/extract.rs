//! Extraction of one generation's data columns from its published artifacts.

use hashql_core::id::{IdSlice, IdVec};

use super::error::ReplayError;
use crate::{
    dataset::{PROJECTOR_DIMENSIONS, TemporalAxes},
    file::{
        array::ArrayFile,
        generation::{Generation, GenerationId},
        identity::read::IdentityFile,
    },
    identity::{BasePosition, EdgeRowId, NodeRowId},
    math::{AlignedVecN, Vec2},
    postgres::id::ArchivedEntityId,
    salt::fit::prepare::identity::IdentityTableArchive,
};

/// One generation's data columns, in the shape the partition consumes.
///
/// The wire coordinates arrive gathered per node row, so the columns share one indexing and a
/// fabricated corpus needs no base-order permutation.
pub(super) struct GenerationColumns<'run> {
    /// The generation's identity.
    id: GenerationId,
    /// The generation's recorded snapshot axes.
    axes: Option<TemporalAxes>,
    /// The entity identity per node row.
    ids: &'run IdSlice<NodeRowId, ArchivedEntityId>,
    /// The projector representation per node row.
    representations: &'run IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    /// The published wire coordinate per node row.
    wire_of_row: &'run IdSlice<NodeRowId, Vec2>,
}

impl<'run> GenerationColumns<'run> {
    /// Admits the columns of one corpus, so a value cannot hold mismatched columns.
    ///
    /// # Errors
    ///
    /// Returns [`ReplayError::Rows`] when the three columns disagree on their row count.
    pub(super) const fn new(
        id: GenerationId,
        axes: Option<TemporalAxes>,
        ids: &'run IdSlice<NodeRowId, ArchivedEntityId>,
        representations: &'run IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
        wire_of_row: &'run IdSlice<NodeRowId, Vec2>,
    ) -> Result<Self, ReplayError> {
        if ids.len() == representations.len() && ids.len() == wire_of_row.len() {
            Ok(Self {
                id,
                axes,
                ids,
                representations,
                wire_of_row,
            })
        } else {
            Err(ReplayError::Rows {
                generation: id,
                identities: ids.len(),
                representations: representations.len(),
                wire: wire_of_row.len(),
            })
        }
    }

    /// The generation's identity.
    pub(super) const fn id(&self) -> GenerationId {
        self.id
    }

    /// The generation's recorded snapshot axes.
    pub(super) const fn axes(&self) -> Option<TemporalAxes> {
        self.axes
    }

    /// The entity identity per node row.
    pub(super) const fn ids(&self) -> &'run IdSlice<NodeRowId, ArchivedEntityId> {
        self.ids
    }

    /// The projector representation per node row.
    pub(super) const fn representations(
        &self,
    ) -> &'run IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>> {
        self.representations
    }

    /// The published wire coordinate per node row.
    pub(super) const fn wire_of_row(&self) -> &'run IdSlice<NodeRowId, Vec2> {
        self.wire_of_row
    }
}

/// One generation's opened artifact files, alive while the columns borrow from them.
pub(super) struct GenerationArtifacts {
    identities: IdentityTableArchive<ArchivedEntityId, NodeRowId>,
    representations: ArrayFile,
    positions: ArrayFile,
    wire: ArrayFile,
}

impl GenerationArtifacts {
    /// Opens one generation's identity, representation, row-position, and wire artifacts.
    pub(super) fn open(generation: &Generation) -> Result<Self, ReplayError> {
        let id = generation.id();
        let files = &generation.repository().files;

        let identities = IdentityTableArchive::new(
            IdentityFile::open(generation.path_of(&files.node_identities.name())).map_err(
                |source| ReplayError::OpenIdentities {
                    generation: id,
                    source,
                },
            )?,
        )
        .map_err(|source| ReplayError::InvalidIdentities {
            generation: id,
            source,
        })?;

        let representations = ArrayFile::open(generation.path_of(&files.representations.name()))
            .map_err(|source| ReplayError::OpenRepresentations {
                generation: id,
                source,
            })?;
        let positions = ArrayFile::open(generation.path_of(&files.position_of_row.name()))
            .map_err(|source| ReplayError::OpenPositions {
                generation: id,
                source,
            })?;
        let wire = ArrayFile::open(generation.path_of(&files.wire_coordinates.name())).map_err(
            |source| ReplayError::OpenWireCoordinates {
                generation: id,
                source,
            },
        )?;

        Ok(Self {
            identities,
            representations,
            positions,
            wire,
        })
    }

    /// Gathers the published wire coordinate of every node row.
    ///
    /// The wire column lives in base delivery order. The row-position column maps each node row
    /// to its base position, so the gather leaves one wire point per node row.
    pub(super) fn wire_of_row(
        &self,
        generation: &Generation,
    ) -> Result<IdVec<NodeRowId, Vec2>, ReplayError> {
        WireArtifacts {
            positions: &self.positions,
            wire: &self.wire,
        }
        .gathered(generation.id())
    }

    /// Borrows the columns the partition consumes.
    pub(super) fn columns<'files>(
        &'files self,
        generation: &Generation,
        wire_of_row: &'files IdSlice<NodeRowId, Vec2>,
    ) -> Result<GenerationColumns<'files>, ReplayError> {
        let id = generation.id();

        let representations = self
            .representations
            .vectors::<PROJECTOR_DIMENSIONS>()
            .ok_or(ReplayError::InvalidRepresentations { generation: id })?;

        GenerationColumns::new(
            id,
            generation.repository().metadata.snapshot.axes,
            self.identities.ids(),
            IdSlice::from_raw(representations),
            wire_of_row,
        )
    }
}

/// The artifact files one wire gather reads, each under its own name.
#[derive(Copy, Clone)]
pub(super) struct WireArtifacts<'files> {
    /// The row-position column, one little-endian base position per node row.
    pub positions: &'files ArrayFile,
    /// The wire-coordinate column, one point per base position in delivery order.
    pub wire: &'files ArrayFile,
}

impl WireArtifacts<'_> {
    /// Gathers the published wire coordinate of every node row from the raw artifacts.
    ///
    /// The position column stores little-endian `u32` slots, the persisted form of the
    /// base-position domain, and the wire column stores one `f32` point per slot.
    ///
    /// # Errors
    ///
    /// Returns [`ReplayError::InvalidPositions`] when the position column does not read as
    /// little-endian `u32` elements, and [`ReplayError::InvalidWireCoordinates`] when the wire
    /// column does not read as points.
    ///
    /// # Panics
    ///
    /// This panics when the position column names a slot beyond the wire column. Both columns
    /// belong to one rehashed generation, so such a slot is a publisher defect, never a lawful
    /// input.
    pub(super) fn gathered(
        self,
        generation: GenerationId,
    ) -> Result<IdVec<NodeRowId, Vec2>, ReplayError> {
        let positions = self
            .positions
            .column::<NodeRowId, BasePosition>()
            .ok_or(ReplayError::InvalidPositions { generation })?;
        let wire = self
            .wire
            .column::<BasePosition, Vec2>()
            .ok_or(ReplayError::InvalidWireCoordinates { generation })?;

        Ok(positions.iter().map(|&position| wire[position]).collect())
    }
}

/// The later generation's opened edge-endpoint artifact.
///
/// The open and the decode are two steps because the decoded pairs borrow the mapped file, so
/// the type owns the file and the borrow happens through [`pairs`](Self::pairs).
pub(super) struct EndpointArtifact {
    /// The mapped edge-endpoint column.
    file: ArrayFile,
}

impl EndpointArtifact {
    /// Opens one generation's edge-endpoint artifact.
    ///
    /// # Errors
    ///
    /// Returns [`ReplayError::OpenEndpoints`] when the artifact cannot open.
    pub(super) fn open(generation: &Generation) -> Result<Self, ReplayError> {
        ArrayFile::open(generation.path_of(&generation.repository().files.edge_endpoints.name()))
            .map(|file| Self { file })
            .map_err(|source| ReplayError::OpenEndpoints {
                generation: generation.id(),
                source,
            })
    }

    /// Views the staged endpoint column as the artifact stores it.
    ///
    /// The node row id is little-endian by construction, so the typed column is the stored form
    /// and the view is exact on every architecture.
    ///
    /// # Errors
    ///
    /// Returns [`ReplayError::InvalidEndpoints`] when the column does not carry the endpoint
    /// element's stamp.
    pub(super) fn pairs(
        &self,
        generation: GenerationId,
    ) -> Result<&IdSlice<EdgeRowId, [NodeRowId; 2]>, ReplayError> {
        self.file
            .column::<EdgeRowId, [NodeRowId; 2]>()
            .ok_or(ReplayError::InvalidEndpoints { generation })
    }
}

#[cfg(test)]
mod tests {
    use std::fs::File;

    use camino::Utf8PathBuf;
    use zerocopy::IntoBytes as _;

    use super::{
        ArrayFile, EndpointArtifact, GenerationColumns, GenerationId, IdSlice, ReplayError, Vec2,
        WireArtifacts,
    };
    use crate::{
        file::{
            WriteInto as _,
            array::{ArrayVariant, ArrayWriter, Dim, SizedColumn},
        },
        identity::{BasePosition, NodeRowId},
    };

    fn generation(ordinal: u8) -> GenerationId {
        format!("{ordinal:064x}")
            .parse()
            .expect("a 64-digit hex literal is a generation id")
    }

    /// A scratch directory for one extraction fixture.
    fn scratch(name: &str) -> Utf8PathBuf {
        let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
            .expect("the temp directory is UTF-8")
            .join(format!(
                "hash-graph-atlas-extract-{}-{name}",
                std::process::id(),
            ));
        let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("the scratch directory is creatable");
        dir
    }

    /// Stages a row-position column through the pipeline's own column writer.
    ///
    /// [`SizedColumn`] stamps the variant from the element type, so the staged file carries
    /// the exact tag every published `position-of-row.arr` carries.
    fn staged_positions(directory: &Utf8PathBuf, positions: &[u32]) -> ArrayFile {
        let column: Vec<BasePosition> = positions
            .iter()
            .map(|&position| BasePosition::new(position))
            .collect();
        let path = directory.join("position-of-row.arr");
        SizedColumn::<NodeRowId, BasePosition>::new(hashql_core::id::IdSlice::from_raw(&column))
            .write_into(File::create(&path).expect("the fixture file creates"))
            .expect("the fixture column writes");
        ArrayFile::open(&path).expect("the staged column opens")
    }

    /// Stages the wire-coordinate column in base delivery order, under the writer's law.
    fn staged_wire(directory: &Utf8PathBuf, points: &[Vec2]) -> ArrayFile {
        let path = directory.join("wire-coordinates.arr");
        SizedColumn::<BasePosition, Vec2>::new(hashql_core::id::IdSlice::from_raw(points))
            .write_into(File::create(&path).expect("the fixture file creates"))
            .expect("the fixture column writes");
        ArrayFile::open(&path).expect("the staged column opens")
    }

    /// Stages an endpoint column with the given variant tag.
    ///
    /// [`ArrayVariant::U64Le`] mirrors the ingest's own writer call; the native variant stages
    /// the refusal fixture.
    fn staged_endpoints(
        directory: &Utf8PathBuf,
        pairs: &[[u64; 2]],
        variant: ArrayVariant,
    ) -> ArrayFile {
        let path = directory.join("edge-endpoints.arr");
        let file = File::create(&path).expect("the fixture file creates");
        let mut writer =
            ArrayWriter::new(file, variant, &[Dim::new(2)]).expect("the fixture writer opens");
        for pair in pairs {
            writer.write_row(pair.as_bytes()).expect("the row writes");
        }
        writer.finish().expect("the fixture column seals");
        ArrayFile::open(&path).expect("the staged column opens")
    }

    #[test]
    fn columns_refuse_mismatched_rows() {
        let wire = [Vec2::new(0.0, 0.5)];
        let result = GenerationColumns::new(
            generation(9),
            None,
            IdSlice::from_raw(&[]),
            IdSlice::from_raw(&[]),
            IdSlice::from_raw(&wire),
        );

        assert!(matches!(
            result,
            Err(ReplayError::Rows {
                identities: 0,
                representations: 0,
                wire: 1,
                ..
            }),
        ));
    }

    #[test]
    fn wire_gathers_the_staged_artifacts() {
        let directory = scratch("wire-gathers");
        let positions = staged_positions(&directory, &[2, 0, 1]);
        let wire = staged_wire(
            &directory,
            &[
                Vec2::new(0.0, 0.5),
                Vec2::new(1.0, 1.5),
                Vec2::new(2.0, 2.5),
            ],
        );

        let gathered = WireArtifacts {
            positions: &positions,
            wire: &wire,
        }
        .gathered(generation(1))
        .expect("the staged artifacts gather");

        assert_eq!(
            gathered.as_raw(),
            &[
                Vec2::new(2.0, 2.5),
                Vec2::new(0.0, 0.5),
                Vec2::new(1.0, 1.5),
            ],
        );
    }

    #[test]
    fn wire_refuses_a_native_position_column() {
        // The pipeline persists base positions little-endian; a native-tagged column is not
        // the published form and refuses rather than reads.
        let directory = scratch("wire-refuses-native");
        let path = directory.join("position-of-row.arr");
        let file = File::create(&path).expect("the fixture file creates");
        let mut writer =
            ArrayWriter::new(file, ArrayVariant::U32, &[]).expect("the fixture writer opens");
        for position in [0_u32, 1] {
            writer
                .write_row(position.as_bytes())
                .expect("the row writes");
        }
        writer.finish().expect("the fixture column seals");
        let positions = ArrayFile::open(&path).expect("the staged column opens");
        let wire = staged_wire(&directory, &[Vec2::new(0.0, 0.5), Vec2::new(1.0, 1.5)]);

        let result = WireArtifacts {
            positions: &positions,
            wire: &wire,
        }
        .gathered(generation(1));

        assert!(matches!(
            result,
            Err(ReplayError::InvalidPositions { generation: named }) if named == generation(1),
        ));
    }

    #[test]
    #[should_panic(expected = "index out of bounds")]
    fn wire_position_beyond_column_panics() {
        // Both columns belong to one rehashed generation, so a position naming a slot beyond
        // the wire column is a publisher defect and dies loudly instead of misreading.
        let directory = scratch("wire-beyond-panics");
        let positions = staged_positions(&directory, &[0, 5]);
        let wire = staged_wire(&directory, &[Vec2::new(0.0, 0.5), Vec2::new(1.0, 1.5)]);

        drop(
            WireArtifacts {
                positions: &positions,
                wire: &wire,
            }
            .gathered(generation(1)),
        );
    }

    #[test]
    fn endpoints_read_the_staged_column() {
        let directory = scratch("endpoints-read");
        let staged = staged_endpoints(&directory, &[[0, 1], [7, 7]], ArrayVariant::U64Le);

        let artifact = EndpointArtifact { file: staged };
        let pairs = artifact
            .pairs(generation(2))
            .expect("the staged column reads");

        let read: Vec<[u64; 2]> = pairs
            .iter()
            .map(|&[source, target]| [source.get(), target.get()])
            .collect();
        assert_eq!(read, [[0, 1], [7, 7]]);
    }

    #[test]
    fn endpoints_refuse_the_native_variant() {
        let directory = scratch("endpoints-refuse-native");
        let staged = staged_endpoints(&directory, &[[0, 1]], ArrayVariant::U64);

        let artifact = EndpointArtifact { file: staged };
        let result = artifact.pairs(generation(2));

        assert!(matches!(
            result,
            Err(ReplayError::InvalidEndpoints { generation: named }) if named == generation(2),
        ));
    }
}
