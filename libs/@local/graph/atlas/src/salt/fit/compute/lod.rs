//! The level-of-detail stage derives the served delivery structure and stages its columns.

use hashql_core::id::{IdSlice, IdVec};
use smallvec::SmallVec;

use super::error::ComputeError;
use crate::{
    file::{
        array::SizedColumn, generation::StagedGeneration, identity::Key, repository::Binding,
        salt::artifact,
    },
    identity::{NodeRowId, OntologyRowId},
    math::FinitePointField,
    salt::{
        adjacency::Adjacency,
        fit::{FitConfig, prepare::identity::IdentityTableArchive},
        importance::{ConstantImportance, DegreeImportance, ImportanceSignal as _, RankingConfig},
        lod::{
            quad::{QuadMeasurements, QuadTree},
            rank::RankInputs,
            stage::{Lod, LodMeasurements, MortonColumn},
        },
        postings::build::{Postings, PostingsMeasurements},
    },
};

/// The level-of-detail stage, bound to the values it derives from.
///
/// [`run`](Self::run) derives the delivery structure and [`Delivery::stage`] persists it, so the
/// computation and its artifacts separate: the stage consumes proven values, and only the staging
/// step touches the generation.
pub(super) struct LevelOfDetail<'fit, I> {
    /// The canonical coordinates, proven finite at their readback.
    coordinates: &'fit FinitePointField<NodeRowId>,
    /// The incident-edge adjacency, the degree signal's source.
    adjacency: &'fit Adjacency,
    /// The staged identity table, the ranking tiebreak's key source.
    ids: &'fit IdentityTableArchive<I, NodeRowId>,
    /// Each node row's direct types in row order.
    types: &'fit IdSlice<NodeRowId, SmallVec<OntologyRowId, 2>>,
    /// Each ontology row's direct parents in row order.
    parents: &'fit IdSlice<OntologyRowId, SmallVec<OntologyRowId, 2>>,
}

impl<'fit, I> LevelOfDetail<'fit, I>
where
    I: Key,
{
    /// Binds the stage to the values it derives from.
    ///
    /// `types` is each node row's direct types in row order, the quadtree's per-tile type sets
    /// and the postings' membership source. `parents` is each ontology row's direct parents in
    /// row order, the postings' type graph.
    pub(super) const fn new(
        coordinates: &'fit FinitePointField<NodeRowId>,
        adjacency: &'fit Adjacency,
        ids: &'fit IdentityTableArchive<I, NodeRowId>,
        types: &'fit IdSlice<NodeRowId, SmallVec<OntologyRowId, 2>>,
        parents: &'fit IdSlice<OntologyRowId, SmallVec<OntologyRowId, 2>>,
    ) -> Self {
        Self {
            coordinates,
            adjacency,
            ids,
            types,
            parents,
        }
    }

    /// Derives the delivery structure: the base order, the quadtree cut, and the postings.
    ///
    /// The importance column comes from the configured signal, and the metadata's ranking origin
    /// records the signal that ran.
    ///
    /// # Errors
    ///
    /// Returns [`ComputeError::WireEncoding`] when the rank inputs refuse their domains, and
    /// [`ComputeError::Lod`], [`ComputeError::Quad`] or [`ComputeError::Postings`] when a build
    /// rejects its input.
    #[tracing::instrument(name = "lod", skip_all)]
    pub(super) fn run(self, config: &FitConfig) -> Result<Delivery, ComputeError> {
        let rows = self.coordinates.len();
        let importance = match config.ranking {
            RankingConfig::ConstantColumns => ConstantImportance.derive(rows),
            RankingConfig::IncidentDegree => DegreeImportance::new(self.adjacency).derive(rows),
        };

        // The priority column is the rank inputs' product-override
        // lane: a product-side boost (a pinned or promoted entity)
        // will feed it the day one exists. Until then every row
        // carries the neutral 0 and the column stays present, so the
        // rank contract and the wire shape do not change when the
        // signal arrives.
        let priority = IdVec::from_domain(0.0_f32, &importance);
        let inputs = RankInputs::new(&importance, &priority, self.ids.ids()).ok_or_else(|| {
            ComputeError::WireEncoding {
                rows: self.ids.len(),
            }
        })?;

        let lod = Lod::build(self.coordinates, inputs, config.seed, config.lod)?;
        drop(importance);
        drop(priority);

        let quad = QuadTree::build(&lod, self.types, config.lod)?;
        let postings = Postings::build(self.types, &lod.row_of_position, self.parents)?;

        let evidence = lod.measurements(config.lod);
        tracing::info!(
            catch_all = evidence.catch_all_population,
            co_location_excess = evidence.co_location_excess,
            quad_nodes = quad.measurements().nodes,
            dense_types = postings.measurements().dense_types,
            "derived the delivery structure"
        );

        Ok(Delivery {
            lod,
            quad,
            postings,
            evidence,
        })
    }
}

/// The derived delivery structure of one fit, computed and not yet staged.
pub(super) struct Delivery {
    /// The served columns in base delivery order.
    lod: Lod,
    /// The quadtree cut over the finished columns.
    quad: QuadTree,
    /// The type postings over the base delivery order.
    postings: Postings,
    /// The delivery-order readings, echoed into the metadata.
    evidence: LodMeasurements,
}

impl Delivery {
    /// Stages every served column and returns the typed artifact set with its measurements.
    ///
    /// # Errors
    ///
    /// Returns an error when a staged column does not write.
    #[tracing::instrument(name = "lod-artifacts", skip_all)]
    pub(super) fn stage(self, staging: &StagedGeneration) -> Result<StagedDelivery, ComputeError> {
        let Self {
            lod,
            quad,
            postings,
            evidence,
        } = self;

        let files = LodArtifacts {
            morton: staging.stage(
                artifact::Morton,
                &MortonColumn {
                    fenceposts: &lod.fenceposts,
                    codes: lod.codes.as_raw(),
                },
            )?,
            quad: staging.stage(artifact::Quad, &quad)?,
            postings: staging.stage(artifact::Postings, &postings)?,
            wire_coordinates: staging.stage(
                artifact::WireCoordinates,
                SizedColumn::new(&lod.coordinates),
            )?,
            rank_of_position: staging.stage(
                artifact::RankOfPosition,
                SizedColumn::new(&lod.rank_of_position),
            )?,
            position_of_rank: staging.stage(
                artifact::PositionOfRank,
                SizedColumn::new(&lod.position_of_rank),
            )?,
            position_of_row: staging.stage(
                artifact::PositionOfRow,
                SizedColumn::new(&lod.position_of_row),
            )?,
            row_of_position: staging.stage(
                artifact::RowOfPosition,
                SizedColumn::new(&lod.row_of_position),
            )?,
        };
        tracing::info!("staged the delivery columns, the quadtree, and the postings");

        Ok(StagedDelivery {
            files,
            evidence,
            quad: quad.measurements(),
            postings: postings.measurements(),
        })
    }
}

/// The staged level-of-detail files of one fit, each binding typed by its artifact.
pub(super) struct LodArtifacts {
    pub morton: Binding<artifact::Morton>,
    pub quad: Binding<artifact::Quad>,
    pub postings: Binding<artifact::Postings>,
    pub wire_coordinates: Binding<artifact::WireCoordinates>,
    pub rank_of_position: Binding<artifact::RankOfPosition>,
    pub position_of_rank: Binding<artifact::PositionOfRank>,
    pub position_of_row: Binding<artifact::PositionOfRow>,
    pub row_of_position: Binding<artifact::RowOfPosition>,
}

/// The staged delivery structure: the typed artifact set and every evidence section.
pub(super) struct StagedDelivery {
    pub files: LodArtifacts,
    pub evidence: LodMeasurements,
    pub quad: QuadMeasurements,
    pub postings: PostingsMeasurements,
}
