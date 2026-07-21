//! The level-of-detail stage: served columns in base delivery order and the quadtree cut over them.

use smallvec::SmallVec;

use super::{
    super::{
        error::StageError,
        prepare::identity::IdentityTableArchive,
        role::{Role, stage, stage_sized_column, write_staged},
    },
    Context,
};
use crate::{
    dataset::OntologyRowId,
    file::{
        array::{ArrayFile, ArrayVariant, Dim},
        identity::read::IdentityFile,
        morton::write::{PAGE_STRIDE, write_regions},
        quad,
        repository::RepositoryFile,
        sprs::read::SprsFile,
    },
    integrity::{Sha256, Writer},
    salt::{
        adjacency::AdjacencyArchive,
        importance::{ConstantImportance, DegreeImportance, ImportanceSignal as _, RankingConfig},
        lod::{
            quad::{QuadEvidence, QuadTree},
            rank::RankInputs,
            stage::{Lod, LodEvidence},
        },
        postings::build::{Postings, PostingsEvidence},
    },
};

/// The staged level-of-detail artifacts of one fit.
pub(super) struct LodArtifacts {
    pub morton: RepositoryFile,
    pub quad: RepositoryFile,
    pub postings: RepositoryFile,
    pub wire_coordinates: RepositoryFile,
    pub rank_of_position: RepositoryFile,
    pub position_of_rank: RepositoryFile,
    pub position_of_row: RepositoryFile,
    pub row_of_position: RepositoryFile,
}

/// Everything the level-of-detail stage produced: the staged files and both evidence sections.
pub(super) struct LodOutputs {
    pub files: LodArtifacts,
    pub evidence: LodEvidence,
    pub quad_evidence: QuadEvidence,
    pub postings_evidence: PostingsEvidence,
}

impl Context<'_> {
    /// Derives the level-of-detail structure over the staged coordinates.
    ///
    /// Stages every served column, and cuts the finished columns into the staged quadtree.
    ///
    /// The importance column comes from the configured signal over the staged artifacts, and the
    /// metadata's ranking origin records the signal that ran. `types` is each node row's direct
    /// types in row order, the quadtree's per-tile type sets and the postings' membership source;
    /// `parents` is each ontology row's direct parents in row order, the postings' type graph.
    pub(super) fn stage_lod<I>(
        &self,
        types: &[SmallVec<OntologyRowId, 2>],
        parents: &[SmallVec<OntologyRowId, 2>],
    ) -> Result<LodOutputs, StageError>
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

        let ids = IdentityTableArchive::<I>::new(IdentityFile::open(
            self.staging.path_of(&Role::NodeIdentities.file_name()),
        )?)?;

        let importance = match self.config.ranking {
            RankingConfig::ConstantColumns => ConstantImportance.derive(points.len()),
            RankingConfig::IncidentDegree => {
                let adjacency = AdjacencyArchive::new(
                    SprsFile::open(self.staging.path_of(&Role::Adjacency.file_name()))
                        .map_err(StageError::MapAdjacency)?,
                )?;
                DegreeImportance::new(&adjacency).derive(points.len())
            }
        };
        // The constant priority column is the override lane; no
        // product signal feeds it yet.
        let priority = vec![0.0_f32; points.len()];
        let inputs = RankInputs::new(&importance, &priority, ids.ids())
            .ok_or_else(|| StageError::WireEncoding { rows: ids.len() })?;

        let lod = Lod::build(points, inputs, self.config.seed, self.config.lod)?;
        drop(importance);
        drop(priority);

        let morton = write_staged(self.staging, Role::Morton, |writer| {
            let mut writer = Writer {
                accumulator: Sha256::new(),
                writer,
            };
            write_regions(PAGE_STRIDE, &lod.fenceposts, &lod.codes, &mut writer)?;
            Ok(writer.accumulator.finalize())
        })?;

        let (quad_file, quad_evidence) = self.stage_quad(&lod, types)?;
        let (postings_file, postings_evidence) =
            self.stage_postings(types, parents, &lod.row_of_position)?;

        let files = LodArtifacts {
            morton,
            quad: quad_file,
            postings: postings_file,
            wire_coordinates: stage_sized_column(
                self.staging,
                Role::WireCoordinates,
                ArrayVariant::F32,
                &[Dim::new(lod.coordinates.len() as u64), Dim::new(2)],
                lod.coordinates.iter().map(zerocopy::IntoBytes::as_bytes),
            )?,
            rank_of_position: stage_sized_column(
                self.staging,
                Role::RankOfPosition,
                ArrayVariant::U32,
                &[Dim::new(lod.rank_of_position.len() as u64)],
                lod.rank_of_position
                    .iter()
                    .map(zerocopy::IntoBytes::as_bytes),
            )?,
            position_of_rank: stage_sized_column(
                self.staging,
                Role::PositionOfRank,
                ArrayVariant::U32,
                &[Dim::new(lod.position_of_rank.len() as u64)],
                lod.position_of_rank
                    .iter()
                    .map(zerocopy::IntoBytes::as_bytes),
            )?,
            position_of_row: stage_sized_column(
                self.staging,
                Role::PositionOfRow,
                ArrayVariant::U32,
                &[Dim::new(lod.position_of_row.len() as u64)],
                lod.position_of_row
                    .iter()
                    .map(zerocopy::IntoBytes::as_bytes),
            )?,
            row_of_position: stage_sized_column(
                self.staging,
                Role::RowOfPosition,
                ArrayVariant::U32,
                &[Dim::new(lod.row_of_position.len() as u64)],
                lod.row_of_position
                    .iter()
                    .map(zerocopy::IntoBytes::as_bytes),
            )?,
        };

        let evidence = lod.evidence(self.config.lod);
        tracing::info!(
            catch_all = evidence.catch_all_population,
            co_location_excess = evidence.co_location_excess,
            quad_nodes = quad_evidence.nodes,
            dense_types = postings_evidence.dense_types,
            "staged the level-of-detail columns, the quadtree, and the postings"
        );

        Ok(LodOutputs {
            files,
            evidence,
            quad_evidence,
            postings_evidence,
        })
    }

    /// Cuts the quadtree over the finished columns while they are still resident and stages it.
    ///
    /// The cut runs under the configuration the cascade ran under, which the build re-checks.
    fn stage_quad(
        &self,
        lod: &Lod,
        types: &[SmallVec<OntologyRowId, 2>],
    ) -> Result<(RepositoryFile, QuadEvidence), StageError> {
        let _span = tracing::info_span!("quad").entered();

        let tree = QuadTree::build(lod, types, self.config.lod)?;
        let file = write_staged(self.staging, Role::Quad, |writer| {
            let mut writer = Writer {
                accumulator: Sha256::new(),
                writer,
            };
            quad::write::write_regions(&tree.nodes, &tree.sets, &mut writer)?;
            Ok(writer.accumulator.finalize())
        })?;

        Ok((file, tree.evidence()))
    }

    /// Builds the postings over the finished lod permutation and stages them beside the quadtree.
    ///
    /// Membership gathers through the same permutation the served columns did; the parent regions
    /// restate the ontology stream.
    fn stage_postings(
        &self,
        types: &[SmallVec<OntologyRowId, 2>],
        parents: &[SmallVec<OntologyRowId, 2>],
        row_of_position: &[u32],
    ) -> Result<(RepositoryFile, PostingsEvidence), StageError> {
        let _span = tracing::info_span!("postings").entered();

        let postings = Postings::build(types, row_of_position, parents, self.config.postings)?;
        let file = stage(self.staging, Role::Postings, &postings)?;

        Ok((file, postings.evidence()))
    }
}
