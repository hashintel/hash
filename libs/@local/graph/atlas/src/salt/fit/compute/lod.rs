//! The level-of-detail stage: served columns in base delivery order and the quadtree cut over them.

use smallvec::SmallVec;

use super::{
    super::{
        error::StageError,
        prepare::identity::IdentityTableArchive,
        role::{Role, Staged, stage, stage_sized_column},
    },
    Context,
};
use crate::{
    file::{
        array::{ArrayFile, ArrayVariant, Dim},
        identity::read::IdentityFile,
        region::ByteStable,
        repository::RepositoryFile,
        sprs::read::SprsFile,
    },
    identity::{NodeRowId, OntologyRowId},
    salt::{
        adjacency::AdjacencyArchive,
        importance::{ConstantImportance, DegreeImportance, ImportanceSignal as _, RankingConfig},
        lod::{
            quad::{QuadMeasurements, QuadTree},
            rank::RankInputs,
            stage::{Lod, LodMeasurements, MortonColumn},
        },
        postings::build::{Postings, PostingsMeasurements},
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

/// Everything the level-of-detail stage produced: the staged files and every evidence section.
pub(super) struct LodOutputs {
    pub files: LodArtifacts,
    pub evidence: LodMeasurements,
    pub quad: QuadMeasurements,
    pub postings: PostingsMeasurements,
}

impl Context<'_> {
    /// Stages one resident column of rows under its role.
    fn stage_column<T>(
        &self,
        role: Role,
        variant: ArrayVariant,
        dims: &[Dim],
        rows: &[T],
    ) -> Result<RepositoryFile, StageError>
    where
        T: zerocopy::IntoBytes + zerocopy::Immutable,
    {
        Ok(stage_sized_column(
            self.staging,
            role,
            variant,
            dims,
            rows.iter().map(zerocopy::IntoBytes::as_bytes),
        )?)
    }

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
        I: ByteStable,
    {
        let _span = tracing::info_span!("lod").entered();

        let coordinates = ArrayFile::open(self.staging.path_of(&Role::Coordinates.file_name()))
            .map_err(StageError::MapCoordinates)?;
        let points = coordinates.points().ok_or(StageError::CoordinateShape)?;

        let ids = IdentityTableArchive::<I, NodeRowId>::new(IdentityFile::open(
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

        // The priority column is the rank inputs' product-override
        // lane: a product-side boost (a pinned or promoted entity)
        // will feed it the day one exists. Until then every row
        // carries the neutral 0 and the column rides along so the
        // rank contract and the wire shape hold still when the
        // signal arrives.
        let priority = vec![0.0_f32; points.len()];
        let inputs = RankInputs::new(&importance, &priority, ids.ids())
            .ok_or_else(|| StageError::WireEncoding { rows: ids.len() })?;

        let lod = Lod::build(points, inputs, self.config.seed, self.config.lod)?;
        drop(importance);
        drop(priority);

        let morton = stage(
            self.staging,
            Role::Morton,
            &MortonColumn {
                fenceposts: &lod.fenceposts,
                codes: &lod.codes,
            },
        )?;

        let quad = self.stage_quad(&lod, types)?;
        let postings = self.stage_postings(types, parents, &lod.row_of_position)?;

        let files = LodArtifacts {
            morton,
            quad: quad.file,
            postings: postings.file,
            wire_coordinates: self.stage_column(
                Role::WireCoordinates,
                ArrayVariant::F32,
                &[Dim::new(lod.coordinates.len() as u64), Dim::new(2)],
                &lod.coordinates,
            )?,
            rank_of_position: self.stage_column(
                Role::RankOfPosition,
                ArrayVariant::U32,
                &[Dim::new(lod.rank_of_position.len() as u64)],
                &lod.rank_of_position,
            )?,
            position_of_rank: self.stage_column(
                Role::PositionOfRank,
                ArrayVariant::U32,
                &[Dim::new(lod.position_of_rank.len() as u64)],
                &lod.position_of_rank,
            )?,
            position_of_row: self.stage_column(
                Role::PositionOfRow,
                ArrayVariant::U32,
                &[Dim::new(lod.position_of_row.len() as u64)],
                &lod.position_of_row,
            )?,
            row_of_position: self.stage_column(
                Role::RowOfPosition,
                ArrayVariant::U32,
                &[Dim::new(lod.row_of_position.len() as u64)],
                &lod.row_of_position,
            )?,
        };

        let evidence = lod.measurements(self.config.lod);
        tracing::info!(
            catch_all = evidence.catch_all_population,
            co_location_excess = evidence.co_location_excess,
            quad_nodes = quad.evidence.nodes,
            dense_types = postings.evidence.dense_types,
            "staged the level-of-detail columns, the quadtree, and the postings"
        );

        Ok(LodOutputs {
            files,
            evidence,
            quad: quad.evidence,
            postings: postings.evidence,
        })
    }

    /// Cuts the quadtree over the finished columns while they are still resident and stages it.
    ///
    /// The cut runs under the configuration the cascade ran under, which the build re-checks.
    fn stage_quad(
        &self,
        lod: &Lod,
        types: &[SmallVec<OntologyRowId, 2>],
    ) -> Result<Staged<(), QuadMeasurements>, StageError> {
        let _span = tracing::info_span!("quad").entered();

        let tree = QuadTree::build(lod, types, self.config.lod)?;
        let file = stage(self.staging, Role::Quad, &tree)?;

        Ok(Staged {
            file,
            artifact: (),
            evidence: tree.measurements(),
        })
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
    ) -> Result<Staged<(), PostingsMeasurements>, StageError> {
        let _span = tracing::info_span!("postings").entered();

        let postings = Postings::build(types, row_of_position, parents, self.config.postings)?;
        let file = stage(self.staging, Role::Postings, &postings)?;

        Ok(Staged {
            file,
            artifact: (),
            evidence: postings.measurements(),
        })
    }
}
