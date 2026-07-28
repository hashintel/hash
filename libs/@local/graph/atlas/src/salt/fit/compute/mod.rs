//! The compute side of one fit: every stage after ingest.
//!
//! [`run`] executes on the rayon pool, so the tokio runtime thread stays free while the CPU-heavy
//! stages - the neighbour link, the landmark layout, the level-of-detail sort - do their work.
//! Nothing here touches the dataset or the embedding provider: every input is a staged file or a
//! value [`Ingested`] carried across the boundary, and every failure is a [`StageError`].

#[cfg(test)]
pub(super) use self::projector::{
    TrainerInner as PlacementInner, device as placement_device, resolve_supplied,
};
use self::{
    lod::LodOutputs,
    policy::{ClassifierArtifacts, PolicyArtifacts},
    projector::{PlacementArtifacts, PlacementInputs},
    relation::RelationArtifacts,
};
use super::{
    FitConfig, SuppliedVerdicts,
    error::StageError,
    ingest::Ingested,
    role::{Role, Staged},
};
use crate::{
    dataset::{OntologyIdentity, PROJECTOR_DIMENSIONS},
    file::{
        array::ArrayFile,
        generation::{Generation, PublishedGeneration, ScratchDirectory, StagedGeneration},
        region::ByteStable,
        repository::{RepositoryFile, RepositoryVersion},
        salt::{
            SaltFiles, SaltRepository,
            metadata::{
                Evidence, LandmarkEvidence, RankingOrigin, Reproducibility, SaltMetadata, Snapshot,
            },
        },
    },
    integrity::Sha256Digest,
    math::AlignedVecN,
    progress::{Progress, Stage},
    salt::{
        knn::{artifact::KnnArchive, recall::RecallSpotCheck},
        landmark::artifact::LandmarkSkeletonArchive,
        policy::{annotation::assembly::AssembledCorpus, classifier::Classifier},
        semantic::artifact::SemanticGraphArchive,
    },
};

mod graph;
mod landmark;
mod lod;
mod policy;
mod projector;
mod relation;

/// The relation-policy classifier supply.
///
/// Resolved on the async side and carried across the thread boundary.
pub(super) enum ClassifierPlan {
    /// Use a fitted model supplied to the run.
    Use {
        /// The deployable model.
        classifier: Classifier,
        /// The SHA-256 of the supplied artifact's bytes.
        source: Sha256Digest,
    },
    /// Fit a model from the assembled annotation corpus.
    Fit {
        /// The assembled training and holdout material, boxed to keep the variants near one size.
        corpus: Box<AssembledCorpus>,
        /// The SHA-256 of the corpus document's bytes.
        source: Sha256Digest,
        /// The corpus document's staged binding.
        staged: RepositoryFile,
    },
}

/// The owned inputs one fit hands across the thread boundary.
pub(super) struct Inputs {
    /// The fit's configuration, echoed into the metadata.
    pub config: FitConfig,
    /// The classifier supply: a fitted model, or the assembled corpus to fit one from.
    pub classifier: ClassifierPlan,
    /// The manifest binding of the supplied reviewed-verdicts file, when one was offered.
    pub reviewed_verdicts: Option<RepositoryFile>,
    /// The validated supplied reviewed-verdicts document.
    pub verdicts: Option<SuppliedVerdicts>,
    /// The generation seeding reuse, when one was offered.
    pub prior: Option<Generation>,
}

/// The compute stages' shared borrows: every stage method hangs off this context.
struct Context<'fit> {
    staging: &'fit StagedGeneration,
    scratch: &'fit ScratchDirectory,
    config: &'fit FitConfig,
}

/// Every compute stage's output, carried whole into the assembly.
struct Computed {
    classifier: ClassifierArtifacts,
    policy: PolicyArtifacts,
    adjacency: RepositoryFile,
    relations: RelationArtifacts,
    knn: Staged<KnnArchive, RecallSpotCheck>,
    semantic: Staged<SemanticGraphArchive>,
    landmarks: Staged<LandmarkSkeletonArchive, LandmarkEvidence>,
    placement: PlacementArtifacts,
    lod: LodOutputs,
}

/// Runs every compute stage over the staged ingest artifacts and seals the generation.
///
/// `I` is the dataset's node id type: the identity artifacts reopen under it for prior-landmark
/// translation and the ranking tiebreak.
#[expect(
    clippy::significant_drop_tightening,
    reason = "the context holds plain borrows and no Drop of its own; the borrow of the staging \
              directory ends before the seal consumes it"
)]
pub(super) fn run<I, O, P>(
    staging: StagedGeneration,
    scratch: &ScratchDirectory,
    inputs: &Inputs,
    ingested: Ingested,
    progress: P,
) -> Result<PublishedGeneration<P>, StageError>
where
    I: ByteStable,
    O: ByteStable + OntologyIdentity + Eq + core::hash::Hash,
    P: Progress,
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

    let (classifier, classifier_artifacts) = context.acquire_classifier(&inputs.classifier)?;
    progress.stage_completed(Stage::Classifier);
    let policy = context.stage_policy(&classifier, &ingested.relations)?;
    progress.stage_completed(Stage::Policy);
    let adjacency = context.stage_adjacency(rows.len())?;
    progress.stage_completed(Stage::Adjacency);
    let relations =
        context.stage_relations(rows.len(), &ingested.instances, &ingested.multi_typed)?;
    progress.stage_completed(Stage::Relations);
    let knn = context.build_neighbour_table(rows)?;
    progress.stage_completed(Stage::Knn);
    let semantic = context.stage_semantic(&knn.artifact)?;
    progress.stage_completed(Stage::Semantic);

    let prior_marks = inputs
        .prior
        .as_ref()
        .map(|generation| context.prior_landmark_marks::<I>(generation))
        .transpose()?;
    let landmarks =
        context.build_landmark_skeleton(rows, &semantic.artifact, prior_marks.as_ref())?;
    progress.stage_completed(Stage::Landmarks);

    let resolution = context.resolve_verdicts::<O>(inputs.verdicts.as_ref())?;
    let placement = context.stage_placement(&PlacementInputs {
        rows,
        skeleton: &landmarks.artifact,
        knn: &knn.artifact,
        semantic: &semantic.artifact,
        indexes: &relations.indexes,
        resolution: &resolution,
    })?;
    progress.stage_completed(Stage::Projector);

    let lod = context.stage_lod::<I>(&ingested.node_types, &ingested.type_parents)?;
    progress.stage_completed(Stage::Lod);

    let repository = assemble(
        inputs,
        ingested,
        Computed {
            classifier: classifier_artifacts,
            policy,
            adjacency,
            relations,
            knn,
            semantic,
            landmarks,
            placement,
            lod,
        },
    );

    let _span = tracing::info_span!("seal").entered();
    let published = staging.seal(&repository)?;
    progress.stage_completed(Stage::Seal);

    Ok(published.with_progress(progress))
}

/// Binds every staged file and evidence value into the repository the seal publishes.
fn assemble(inputs: &Inputs, ingested: Ingested, computed: Computed) -> SaltRepository {
    let (annotation_corpus, annotation_embeddings, annotation_hashes) =
        match computed.classifier.annotation {
            Some(annotation) => (
                Some(annotation.corpus),
                Some(annotation.embeddings),
                Some(annotation.hashes),
            ),
            None => (None, None, None),
        };

    SaltRepository {
        version: RepositoryVersion::V1,
        files: SaltFiles {
            representations: ingested.representations,
            card_embeddings: ingested.cards.embeddings,
            card_hashes: ingested.cards.hashes,
            knn: computed.knn.file,
            semantic: computed.semantic.file,
            landmarks: computed.landmarks.file,
            classifier: computed.policy.classifier,
            policy: computed.policy.policy,
            attraction: computed.relations.attraction,
            protection: computed.relations.protection,
            coordinates: computed.placement.coordinates,
            morton: computed.lod.files.morton,
            quad: computed.lod.files.quad,
            postings: computed.lod.files.postings,
            wire_coordinates: computed.lod.files.wire_coordinates,
            rank_of_position: computed.lod.files.rank_of_position,
            position_of_rank: computed.lod.files.position_of_rank,
            position_of_row: computed.lod.files.position_of_row,
            row_of_position: computed.lod.files.row_of_position,
            node_identities: ingested.node_identities,
            edge_identities: ingested.edge_identities,
            ontology_identities: ingested.cards.identities,
            edge_endpoints: ingested.edge_endpoints,
            adjacency: computed.adjacency,
            projector: computed.placement.checkpoint,
            reviewed_verdicts: inputs.reviewed_verdicts.clone(),
            annotation_corpus,
            annotation_embeddings,
            annotation_hashes,
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
            placement: computed.placement.placement,
            ranking: RankingOrigin::from(inputs.config.ranking),
            evidence: Evidence {
                cards: ingested.cards.stats,
                norm: ingested.norm,
                recall: computed.knn.evidence,
                landmarks: computed.landmarks.evidence,
                policy: computed.policy.evidence,
                classifier: Some(computed.classifier.evidence),
                relations: computed.relations.indexes.measurements,
                lod: computed.lod.evidence,
                quad: computed.lod.quad,
                postings: computed.lod.postings,
                projector: computed.placement.evidence,
            },
        },
    }
}
