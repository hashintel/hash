//! The level-of-detail stage produces the served columns in base delivery order and the quadtree
//! cut over them.

use hashql_core::id::{Id, IdSlice, IdVec};
use smallvec::SmallVec;

use super::{Context, coordinates::Coordinates, error::ComputeError};
use crate::{
    file::{
        array::{ArrayVariant, Dim, SizedArrayWriter},
        identity::Key,
        repository::RepositoryFile,
    },
    identity::{BasePosition, NodeRowId, OntologyRowId},
    salt::{
        adjacency::Adjacency,
        fit::{prepare::identity::IdentityTableArchive, role::Role},
        importance::{ConstantImportance, DegreeImportance, ImportanceSignal as _, RankingConfig},
        lod::{
            quad::{QuadMeasurements, QuadTree},
            rank::RankInputs,
            stage::{Lod, LodMeasurements, MortonColumn},
        },
        postings::build::{Postings, PostingsMeasurements},
    },
};

/// The staged level-of-detail files of one fit.
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

/// The level-of-detail structure of one fit: the staged files and every evidence section.
pub(super) struct LevelOfDetail {
    pub files: LodArtifacts,
    pub evidence: LodMeasurements,
    pub quad: QuadMeasurements,
    pub postings: PostingsMeasurements,
}

impl LevelOfDetail {
    /// Derives the level-of-detail structure over the staged coordinates.
    ///
    /// Stages every served column, and cuts the finished columns into the staged quadtree.
    ///
    /// The importance column comes from the configured signal over `adjacency`, the value the
    /// relation stage built, and the metadata's ranking origin records the signal that ran.
    /// `types` is each node row's direct types in row order, the quadtree's per-tile type sets
    /// and the postings' membership source; `parents` is each ontology row's direct parents in
    /// row order, the postings' type graph.
    ///
    /// # Errors
    ///
    /// Returns [`ComputeError::WireEncoding`] when the rank inputs refuse their domains,
    /// [`ComputeError::Lod`], [`ComputeError::Quad`] or [`ComputeError::Postings`] when a build
    /// rejects its input, and an I/O error when a staged column does not write.
    #[tracing::instrument(name = "lod", skip_all)]
    pub(super) fn stage<I>(
        context: &Context,
        coordinates: &Coordinates,
        adjacency: &Adjacency,
        ids: &IdentityTableArchive<I, NodeRowId>,
        types: &[SmallVec<OntologyRowId, 2>],
        parents: &[SmallVec<OntologyRowId, 2>],
    ) -> Result<Self, ComputeError>
    where
        I: Key,
    {
        let points = coordinates.as_raw();

        let importance = match context.config.ranking {
            RankingConfig::ConstantColumns => ConstantImportance.derive(points.len()),
            RankingConfig::IncidentDegree => DegreeImportance::new(adjacency).derive(points.len()),
        };

        // The priority column is the rank inputs' product-override lane: a product-side boost (a
        // pinned or promoted entity) will feed it the day one exists. Until then every row
        // carries the neutral 0 and the column stays present, so the rank contract and the wire
        // shape do not change when the signal arrives.
        let priority = IdVec::from_domain(0.0_f32, &importance);
        let inputs = RankInputs::new(&importance, &priority, ids.ids())
            .ok_or_else(|| ComputeError::WireEncoding { rows: ids.len() })?;

        let lod = Lod::build(points, inputs, context.config.seed, context.config.lod)?;
        drop(importance);
        drop(priority);

        // The row-order and type-domain claims the streams established, pinned once at the seam.
        let types = IdSlice::<NodeRowId, _>::from_raw(types);
        let parents = IdSlice::<OntologyRowId, _>::from_raw(parents);

        let morton = context.staging.stage(
            Role::Morton.file_name(),
            &MortonColumn {
                fenceposts: &lod.fenceposts,
                codes: lod.codes.as_raw(),
            },
        )?;

        let (quad, quad_measurements) = Self::stage_quad(context, &lod, types)?;
        let (postings, postings_measurements) =
            Self::stage_postings(context, types, parents, &lod.row_of_position)?;

        let files = LodArtifacts {
            morton,
            quad,
            postings,
            wire_coordinates: stage_column(
                context,
                Role::WireCoordinates,
                ArrayVariant::F32,
                &[Dim::new(lod.coordinates.len() as u64), Dim::new(2)],
                &lod.coordinates,
            )?,
            rank_of_position: stage_column(
                context,
                Role::RankOfPosition,
                ArrayVariant::U32Le,
                &[Dim::new(lod.rank_of_position.len() as u64)],
                &lod.rank_of_position,
            )?,
            position_of_rank: stage_column(
                context,
                Role::PositionOfRank,
                ArrayVariant::U32Le,
                &[Dim::new(lod.position_of_rank.len() as u64)],
                &lod.position_of_rank,
            )?,
            position_of_row: stage_column(
                context,
                Role::PositionOfRow,
                ArrayVariant::U32Le,
                &[Dim::new(lod.position_of_row.len() as u64)],
                &lod.position_of_row,
            )?,
            row_of_position: stage_column(
                context,
                Role::RowOfPosition,
                ArrayVariant::U64Le,
                &[Dim::new(lod.row_of_position.len() as u64)],
                &lod.row_of_position,
            )?,
        };

        let evidence = lod.measurements(context.config.lod);
        tracing::info!(
            catch_all = evidence.catch_all_population,
            co_location_excess = evidence.co_location_excess,
            quad_nodes = quad_measurements.nodes,
            dense_types = postings_measurements.dense_types,
            "staged the level-of-detail columns, the quadtree, and the postings"
        );

        Ok(Self {
            files,
            evidence,
            quad: quad_measurements,
            postings: postings_measurements,
        })
    }

    /// Cuts the quadtree over the finished columns while they are still resident and stages it.
    ///
    /// The cut runs under the configuration the cascade ran under, which the build re-checks.
    fn stage_quad(
        context: &Context,
        lod: &Lod,
        types: &IdSlice<NodeRowId, SmallVec<OntologyRowId, 2>>,
    ) -> Result<(RepositoryFile, QuadMeasurements), ComputeError> {
        let _span = tracing::info_span!("quad").entered();

        let tree = QuadTree::build(lod, types, context.config.lod)?;
        let file = context.staging.stage(Role::Quad.file_name(), &tree)?;

        Ok((file, tree.measurements()))
    }

    /// Builds the postings over the finished lod permutation and stages them beside the quadtree.
    ///
    /// Membership gathers through the same permutation the served columns did. The parent
    /// regions restate the ontology stream.
    fn stage_postings(
        context: &Context,
        types: &IdSlice<NodeRowId, SmallVec<OntologyRowId, 2>>,
        parents: &IdSlice<OntologyRowId, SmallVec<OntologyRowId, 2>>,
        row_of_position: &IdSlice<BasePosition, NodeRowId>,
    ) -> Result<(RepositoryFile, PostingsMeasurements), ComputeError> {
        let _span = tracing::info_span!("postings").entered();

        let postings = Postings::build(types, row_of_position, parents)?;
        let file = context
            .staging
            .stage(Role::Postings.file_name(), &postings)?;

        Ok((file, postings.measurements()))
    }
}

/// Stages one resident column of rows under its role.
fn stage_column<I, T>(
    context: &Context,
    role: Role,
    variant: ArrayVariant,
    dims: &[Dim],
    rows: &IdSlice<I, T>,
) -> Result<RepositoryFile, ComputeError>
where
    I: Id,
    T: zerocopy::IntoBytes + zerocopy::Immutable,
{
    Ok(context.staging.stage_with(role.file_name(), |writer| {
        let mut array = SizedArrayWriter::new(writer, variant, dims)?;
        for row in rows.iter() {
            array.write_row(zerocopy::IntoBytes::as_bytes(row))?;
        }
        array.finish()
    })?)
}
