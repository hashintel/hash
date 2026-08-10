//! The compute side of one fit, covering every stage after ingest.
//!
//! [`run`] executes on the rayon pool, so the tokio runtime thread stays free while the CPU-heavy
//! stages - the neighbour link, the landmark layout, the level-of-detail sort - do their work.
//! Nothing here touches the dataset or the embedding provider: every input is a staged file or a
//! value [`Ingested`] carried across the boundary, and every failure is a [`StageError`].

use hashql_core::id::IdSlice;

#[cfg(test)]
pub(super) use self::projector::resolve_supplied;
pub(crate) use self::projector::{TrainerInner as PlacementInner, device as placement_device};
use self::{
    lod::LodOutputs,
    policy::{ClassifierArtifacts, PolicyArtifacts},
    projector::{DistinctInputs, PlacementArtifacts, PlacementInputs},
    quotient::DistinctRowId,
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
        identity::Key,
        repository::{RepositoryFile, RepositoryVersion},
        salt::{
            SaltFiles, SaltRepository,
            metadata::{
                Evidence, LandmarkEvidence, RankingOrigin, Reproducibility, SaltMetadata, Snapshot,
            },
        },
    },
    identity::NodeRowId,
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
mod quotient;
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
    /// A fitted model, or the assembled corpus to fit one from.
    pub classifier: ClassifierPlan,
    /// The manifest binding of the supplied reviewed-verdicts file, when the fit received one.
    pub reviewed_verdicts: Option<RepositoryFile>,
    /// The validated supplied reviewed-verdicts document.
    pub verdicts: Option<SuppliedVerdicts>,
    /// The generation seeding reuse, when the fit received one.
    pub prior: Option<Generation>,
}

/// The shared borrows every compute stage method reads from.
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
    knn: Staged<KnnArchive<NodeRowId>, RecallSpotCheck>,
    semantic: Staged<SemanticGraphArchive<NodeRowId>>,
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
    progress: &P,
) -> Result<PublishedGeneration, StageError>
where
    I: Key,
    O: Key + OntologyIdentity + Eq + core::hash::Hash,
    P: Progress + Sync,
{
    let context = Context {
        staging: &staging,
        scratch,
        config: &inputs.config,
    };

    let representations = ArrayFile::open(staging.path_of(&Role::Representations.file_name()))
        .map_err(StageError::MapRepresentations)?;
    let rows: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>> = IdSlice::from_raw(
        representations
            .vectors()
            .expect("the representation matrix was sealed as f32 rows of the projector width"),
    );

    let (quotient, distinct_matrix) = build_quotient(scratch, rows)?;
    let distinct: &IdSlice<DistinctRowId, AlignedVecN<PROJECTOR_DIMENSIONS>> =
        IdSlice::from_raw(distinct_matrix.as_ref().map_or(rows.as_raw(), |matrix| {
            matrix
                .vectors()
                .expect("the distinct matrix was written as f32 rows of the projector width")
        }));

    let (classifier, classifier_artifacts) =
        context.acquire_classifier(&inputs.classifier, progress)?;
    progress.stage_completed(Stage::Classifier);
    let policy = context.stage_policy(&classifier, &ingested.relations)?;
    progress.stage_completed(Stage::Policy);
    let adjacency = context.stage_adjacency(rows.len())?;
    progress.stage_completed(Stage::Adjacency);
    let relations = context.stage_relations(
        rows.len(),
        &quotient,
        &ingested.instances,
        &ingested.multi_typed,
        ingested.clamped_confidences,
    )?;
    progress.stage_completed(Stage::Relations);
    let (knn, distinct_knn) =
        context.build_neighbour_table(scratch, distinct, &quotient, progress)?;

    progress.stage_completed(Stage::Knn);
    let (semantic, distinct_semantic) =
        context.stage_semantic(scratch, &knn.artifact, &distinct_knn, &quotient)?;
    progress.stage_completed(Stage::Semantic);

    let prior_marks = inputs
        .prior
        .as_ref()
        .map(|generation| context.prior_landmark_marks::<I>(generation))
        .transpose()?;
    let landmarks = context.build_landmark_skeleton(
        distinct,
        &distinct_semantic,
        prior_marks.as_ref(),
        &quotient,
    )?;
    progress.stage_completed(Stage::Landmarks);

    let (snapshot, reproducibility) = input_sections(inputs, &ingested);
    let resolution = context.resolve_verdicts::<O>(inputs.verdicts.as_ref())?;
    let placement = context.stage_placement(
        &PlacementInputs {
            rows,
            skeleton: &landmarks.artifact,
            resolution: &resolution,
            snapshot: &snapshot,
            reproducibility: &reproducibility,
            distinct: DistinctInputs {
                rows: distinct,
                quotient: &quotient,
                knn: &distinct_knn,
                semantic: &distinct_semantic,
                indexes: &relations.trainer,
            },
        },
        progress,
    )?;
    progress.stage_completed(Stage::Projector);

    let lod = context.stage_lod::<I>(&ingested.node_types, &ingested.type_parents)?;
    progress.stage_completed(Stage::Lod);

    let repository = assemble(
        inputs,
        ingested,
        snapshot,
        reproducibility,
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

    Ok(published)
}

/// Builds the fit's training row domain: the corpus row quotient and its distinct matrix.
///
/// Byte-identical representation rows collapse onto their first occurrences, so the geometric
/// stages measure distinct points while every published artifact stays over the corpus rows. The
/// distinct matrix materializes under `directory` exactly when copies exist; an identity quotient
/// trains over the corpus matrix directly.
fn build_quotient(
    directory: &ScratchDirectory,
    rows: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
) -> Result<(quotient::RowQuotient, Option<ArrayFile>), StageError> {
    let _span = tracing::info_span!("quotient").entered();
    let quotient = quotient::RowQuotient::build(rows);

    let matrix = if quotient.is_identity() {
        None
    } else {
        let path = quotient::materialize_distinct(directory, rows, &quotient)?;
        Some(ArrayFile::open(path).map_err(StageError::MapRepresentations)?)
    };

    tracing::info!(
        rows = rows.len(),
        distinct = quotient.distinct_len(),
        "built the representation quotient"
    );

    Ok((quotient, matrix))
}

/// Builds the metadata document's input sections.
///
/// Built ahead of placement: the paired-movement draw derives its salt from these exact values,
/// and the seal serializes the same ones ([`assemble`]).
fn input_sections(inputs: &Inputs, ingested: &Ingested) -> (Snapshot, Reproducibility) {
    (
        Snapshot {
            axes: ingested.axes,
            nodes: ingested.nodes,
            edges: ingested.edges,
            ontology_types: ingested.cards.types,
        },
        Reproducibility {
            config: inputs.config.clone(),
            embedder: ingested.fingerprint,
            prior: inputs.prior.as_ref().map(Generation::id),
        },
    )
}

/// Binds every staged file and evidence value into the repository the seal publishes.
///
/// The `snapshot` and `reproducibility` sections arrive pre-built: the placement stage borrowed
/// them for the paired-movement salt, and the sealed document records the same values.
fn assemble(
    inputs: &Inputs,
    ingested: Ingested,
    snapshot: Snapshot,
    reproducibility: Reproducibility,
    computed: Computed,
) -> SaltRepository {
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
        version: RepositoryVersion::V2,
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
            snapshot,
            reproducibility,
            placement: computed.placement.placement,
            ranking: RankingOrigin::from(inputs.config.ranking),
            evidence: Evidence {
                cards: ingested.cards.stats,
                norm: ingested.norm,
                recall: computed.knn.evidence,
                landmarks: computed.landmarks.evidence,
                policy: computed.policy.evidence,
                classifier: computed.classifier.evidence,
                relations: computed.relations.indexes.measurements,
                lod: computed.lod.evidence,
                quad: computed.lod.quad,
                postings: computed.lod.postings,
                projector: computed.placement.evidence,
            },
        },
    }
}
