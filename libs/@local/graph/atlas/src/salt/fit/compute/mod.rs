//! The compute side of one fit: every stage after ingest.
//!
//! [`run`] executes on the rayon pool, so the tokio runtime thread
//! stays free while the CPU-heavy stages - the neighbour link, the
//! landmark layout, the level-of-detail sort - do their work. Nothing
//! here touches the dataset or the embedding provider: every input is
//! a staged file or a value [`Ingested`] carried across the boundary,
//! and every failure is a [`StageError`].

use self::projector::PlacementInputs;
use super::{FitConfig, SuppliedVerdicts, error::StageError, ingest::Ingested, role::Role};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::{
        array::ArrayFile,
        generation::{Generation, PublishedGeneration, ScratchDirectory, StagedGeneration},
        landmark::read::LandmarkFile,
        repository::{RepositoryFile, RepositoryVersion},
        salt::{
            SaltFiles, SaltRepository,
            metadata::{
                Evidence, LandmarkEvidence, Placement, PolicyEvidence, ProjectorEvidence,
                RankingOrigin, Reproducibility, SaltMetadata, Snapshot,
            },
        },
        sprs::read::SprsFile,
    },
    math::AlignedVecN,
    salt::{
        knn::{artifact::MappedKnn, recall::RecallSpotCheck},
        landmark::artifact::MappedLandmarkSkeleton,
        lod::{quad::QuadEvidence, stage::LodEvidence},
        policy::classifier::Classifier,
        relation::BuildEvidence,
    },
};

mod graph;
mod landmark;
mod lod;
mod policy;
mod projector;
mod relation;

/// The owned inputs one fit hands across the thread boundary.
pub(super) struct Inputs {
    /// The fit's configuration, echoed into the metadata.
    pub config: FitConfig,
    /// The supplied relation-policy model.
    pub classifier: Classifier,
    /// The staged supplied reviewed-verdicts file, when one was
    /// offered; staging happened before ingest, so the manifest
    /// binding crosses the boundary beside the document itself.
    pub reviewed_verdicts: Option<RepositoryFile>,
    /// The validated reviewed-verdicts document: the trainer's phase
    /// boundary resolves it against the staged ontology identities.
    pub verdicts: Option<SuppliedVerdicts>,
    /// The generation seeding reuse, when one was offered.
    pub prior: Option<Generation>,
}

/// The compute stages' shared borrows: every stage method hangs off
/// this context.
struct Context<'fit> {
    staging: &'fit StagedGeneration,
    scratch: &'fit ScratchDirectory,
    config: &'fit FitConfig,
}

/// Every artifact and evidence value the compute stages produce: what
/// the assembly binds beside the ingest's.
struct Computed {
    classifier: RepositoryFile,
    policy: RepositoryFile,
    policy_evidence: PolicyEvidence,
    adjacency: RepositoryFile,
    attraction: RepositoryFile,
    protection: RepositoryFile,
    relation_evidence: BuildEvidence,
    knn: RepositoryFile,
    recall: RecallSpotCheck,
    semantic: RepositoryFile,
    landmarks: RepositoryFile,
    landmark_evidence: LandmarkEvidence,
    coordinates: RepositoryFile,
    projector: Option<RepositoryFile>,
    placement: Placement,
    projector_evidence: Option<ProjectorEvidence>,
    lod: lod::LodArtifacts,
    lod_evidence: LodEvidence,
    quad_evidence: QuadEvidence,
}

/// Runs every compute stage over the staged ingest artifacts and seals
/// the generation.
///
/// `I` is the dataset's node id type: the identity artifacts reopen
/// under it for prior-landmark translation and the ranking tiebreak.
#[expect(
    clippy::significant_drop_tightening,
    reason = "the context holds plain borrows and no Drop of its own; the borrow of the staging \
              directory ends before the seal consumes it"
)]
pub(super) fn run<I>(
    staging: StagedGeneration,
    scratch: &ScratchDirectory,
    inputs: &Inputs,
    ingested: Ingested,
) -> Result<PublishedGeneration, StageError>
where
    I: Copy
        + Sync
        + zerocopy::IntoBytes
        + zerocopy::FromBytes
        + zerocopy::Immutable
        + zerocopy::Unaligned
        + zerocopy::KnownLayout,
{
    let context = Context {
        staging: &staging,
        scratch,
        config: &inputs.config,
    };

    let representations = ArrayFile::open(staging.path_of(&Role::Representations.file_name()))
        .map_err(StageError::MapRepresentations)?;
    let rows: &[AlignedVecN<PROJECTOR_DIMENSIONS>] = representations
        .vectors()
        .expect("the representation matrix was sealed as f32 rows of the projector width");

    // Policy: classify every relation type's card and resolve the
    // certified policy table beside the classifier that produced it.
    let (classifier_file, policy_file, policy_evidence) =
        context.stage_policy(&inputs.classifier, &ingested.relations)?;
    tracing::info!(
        relations = policy_evidence.relations,
        overridden = policy_evidence.overridden,
        "staged the classifier and the resolved policy table"
    );

    // Adjacency: the serving topology, derived from the staged
    // endpoint column alone.
    let adjacency_file = context.stage_adjacency(rows.len())?;
    tracing::info!("staged the incident-edge adjacency");

    // Relations: assemble the spooled instances against the resolved
    // policies and stage both relation indexes.
    let relations = context.stage_relations(rows.len(), &ingested.instances)?;
    tracing::info!(
        retained = relations.indexes.evidence.retained_edges,
        pruned = relations.indexes.evidence.pruned_edges,
        self_references = relations.indexes.evidence.self_references,
        "staged the attraction and protection indexes"
    );

    // Neighbours: build the search backend, admit it by exact recall,
    // and derive the persisted table from it.
    let (recall, knn_file) = context.build_neighbour_table(rows)?;
    let knn = MappedKnn::new(SprsFile::open(staging.path_of(&Role::Knn.file_name()))?)?;
    tracing::info!(recall = recall.recall(), "staged the admitted k-NN table");

    // Semantic graph: smooth the mapped table into fuzzy memberships.
    let (semantic_file, semantic) = context.stage_semantic(&knn)?;

    // Landmarks: select, assign, contract, and lay out the skeleton.
    // The prior generation's landmarks translate to current rows
    // through the identity artifacts and compete for the retained
    // share of the selection.
    let prior_marks = inputs
        .prior
        .as_ref()
        .map(|generation| context.prior_landmark_marks::<I>(generation))
        .transpose()?;
    let (landmarks_file, landmark_evidence) =
        context.build_landmark_skeleton(rows, &semantic, prior_marks.as_ref())?;
    let skeleton = MappedLandmarkSkeleton::new(LandmarkFile::open(
        staging.path_of(&Role::Landmarks.file_name()),
    )?)?;
    tracing::info!(
        selected = landmark_evidence.selected,
        "staged the landmark skeleton"
    );

    // Placement: the configured placer stages the canonical
    // coordinates - the landmark baseline directly, or the trained
    // projector through its checkpoint and condition ladder.
    let placement = context.stage_placement::<I>(&PlacementInputs {
        rows,
        skeleton: &skeleton,
        knn: &knn,
        semantic: &semantic,
        indexes: &relations.indexes,
        verdicts: inputs.verdicts.as_ref(),
    })?;

    // Level of detail: rank, cascade, and gather the served columns
    // over the staged coordinates, cutting the quadtree over them.
    let lod_outputs = context.stage_lod::<I>(&ingested.node_types)?;
    tracing::info!(
        catch_all = lod_outputs.evidence.catch_all_population,
        co_location_excess = lod_outputs.evidence.co_location_excess,
        quad_nodes = lod_outputs.quad_evidence.nodes,
        "staged the level-of-detail columns and the quadtree"
    );

    let repository = assemble(
        inputs,
        ingested,
        Computed {
            classifier: classifier_file,
            policy: policy_file,
            policy_evidence,
            adjacency: adjacency_file,
            attraction: relations.attraction,
            protection: relations.protection,
            relation_evidence: relations.indexes.evidence,
            knn: knn_file,
            recall,
            semantic: semantic_file,
            landmarks: landmarks_file,
            landmark_evidence,
            coordinates: placement.coordinates,
            projector: placement.checkpoint,
            placement: placement.placement,
            projector_evidence: placement.evidence,
            lod: lod_outputs.files,
            lod_evidence: lod_outputs.evidence,
            quad_evidence: lod_outputs.quad_evidence,
        },
    );

    let _span = tracing::info_span!("seal").entered();
    staging.seal(&repository).map_err(StageError::Seal)
}

/// Binds every staged file and evidence value into the repository the
/// seal publishes.
fn assemble(inputs: &Inputs, ingested: Ingested, computed: Computed) -> SaltRepository {
    SaltRepository {
        version: RepositoryVersion::V0,
        files: SaltFiles {
            representations: ingested.representations,
            card_embeddings: ingested.cards.embeddings,
            card_hashes: ingested.cards.hashes,
            knn: computed.knn,
            semantic: computed.semantic,
            landmarks: computed.landmarks,
            classifier: computed.classifier,
            policy: computed.policy,
            attraction: computed.attraction,
            protection: computed.protection,
            coordinates: computed.coordinates,
            morton: computed.lod.morton,
            quad: computed.lod.quad,
            wire_coordinates: computed.lod.wire_coordinates,
            rank_of_position: computed.lod.rank_of_position,
            position_of_rank: computed.lod.position_of_rank,
            position_of_row: computed.lod.position_of_row,
            row_of_position: computed.lod.row_of_position,
            node_identities: ingested.node_identities,
            edge_identities: ingested.edge_identities,
            ontology_identities: ingested.cards.identities,
            edge_endpoints: ingested.edge_endpoints,
            adjacency: computed.adjacency,
            projector: computed.projector,
            reviewed_verdicts: inputs.reviewed_verdicts.clone(),
        },
        metadata: SaltMetadata {
            snapshot: Snapshot {
                axes: ingested.axes,
                nodes: ingested.nodes,
                edges: ingested.edges,
                ontology_types: ingested.cards.types,
            },
            reproducibility: Reproducibility {
                config: inputs.config.clone(),
                embedder: ingested.fingerprint,
                prior: inputs.prior.as_ref().map(Generation::id),
            },
            placement: computed.placement,
            ranking: RankingOrigin::from(inputs.config.ranking),
            evidence: Evidence {
                cards: ingested.cards.stats,
                norm: ingested.norm,
                recall: computed.recall,
                landmarks: computed.landmark_evidence,
                policy: computed.policy_evidence,
                relations: computed.relation_evidence,
                lod: computed.lod_evidence,
                quad: computed.quad_evidence,
                projector: computed.projector_evidence,
            },
        },
    }
}
