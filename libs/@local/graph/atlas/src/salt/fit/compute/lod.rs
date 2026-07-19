//! The level-of-detail stage: served columns in base delivery order.

use super::{
    super::{
        error::StageError,
        prepare::identity::MappedIdentityTable,
        role::{Role, stage_column, write_staged},
    },
    Context,
};
use crate::{
    file::{
        array::{ArrayFile, ArrayVariant, Dim},
        identity::read::IdentityFile,
        morton::write::{PAGE_STRIDE, write_regions},
        repository::RepositoryFile,
    },
    integrity::{Sha256, Writer},
    salt::lod::{
        rank::RankInputs,
        stage::{Lod, LodEvidence},
    },
};

/// The staged level-of-detail artifacts of one fit.
pub(super) struct LodArtifacts {
    pub morton: RepositoryFile,
    pub wire_coordinates: RepositoryFile,
    pub rank_of_position: RepositoryFile,
    pub position_of_rank: RepositoryFile,
    pub position_of_row: RepositoryFile,
    pub row_of_position: RepositoryFile,
}

impl Context<'_> {
    /// Derives the level-of-detail structure over the staged
    /// coordinates and stages every served column.
    ///
    /// The rank inputs are constant columns - the dataset carries no
    /// importance or priority yet - so the delivery order reduces to
    /// the seeded identity tiebreak; the metadata's ranking origin
    /// records it.
    pub(super) fn stage_lod<I>(&self) -> Result<(LodArtifacts, LodEvidence), StageError>
    where
        I: Copy
            + Sync
            + zerocopy::IntoBytes
            + zerocopy::FromBytes
            + zerocopy::Immutable
            + zerocopy::Unaligned
            + zerocopy::KnownLayout,
    {
        let _span = tracing::info_span!("lod").entered();

        let coordinates = ArrayFile::open(self.staging.path_of(&Role::Coordinates.file_name()))
            .map_err(StageError::MapCoordinates)?;
        let points = coordinates
            .points()
            .expect("the coordinate column was sealed as f32 pairs");

        let ids = MappedIdentityTable::<I>::new(IdentityFile::open(
            self.staging.path_of(&Role::NodeIdentities.file_name()),
        )?)?;

        let zeros = vec![0.0_f32; points.len()];
        let inputs = RankInputs::new(&zeros, &zeros, ids.ids())
            .ok_or_else(|| StageError::WireEncoding { rows: ids.len() })?;

        let lod = Lod::build(points, inputs, self.config.seed, self.config.lod)?;
        drop(zeros);

        let morton = write_staged(self.staging, Role::Morton, |writer| {
            let mut writer = Writer {
                accumulator: Sha256::new(),
                writer,
            };
            write_regions(PAGE_STRIDE, &lod.fenceposts, &lod.codes, &mut writer)?;
            Ok(writer.accumulator.finalize())
        })?;

        let files = LodArtifacts {
            morton,
            wire_coordinates: stage_column(
                self.staging,
                Role::WireCoordinates,
                ArrayVariant::F32,
                &[Dim::new(2)],
                lod.coordinates.iter().map(zerocopy::IntoBytes::as_bytes),
            )?,
            rank_of_position: stage_column(
                self.staging,
                Role::RankOfPosition,
                ArrayVariant::U32,
                &[],
                lod.rank_of_position
                    .iter()
                    .map(zerocopy::IntoBytes::as_bytes),
            )?,
            position_of_rank: stage_column(
                self.staging,
                Role::PositionOfRank,
                ArrayVariant::U32,
                &[],
                lod.position_of_rank
                    .iter()
                    .map(zerocopy::IntoBytes::as_bytes),
            )?,
            position_of_row: stage_column(
                self.staging,
                Role::PositionOfRow,
                ArrayVariant::U32,
                &[],
                lod.position_of_row
                    .iter()
                    .map(zerocopy::IntoBytes::as_bytes),
            )?,
            row_of_position: stage_column(
                self.staging,
                Role::RowOfPosition,
                ArrayVariant::U32,
                &[],
                lod.row_of_position
                    .iter()
                    .map(zerocopy::IntoBytes::as_bytes),
            )?,
        };

        Ok((files, lod.evidence(self.config.lod)))
    }
}
