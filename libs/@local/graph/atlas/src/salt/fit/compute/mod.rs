//! The compute side of one fit, covering every stage after ingest.
//!
//! [`Compute::run`] executes on the rayon pool, so the tokio runtime thread stays free while the
//! CPU-heavy stages - the neighbour link, the landmark layout, the level-of-detail sort - do
//! their work. Nothing here touches the dataset or the embedding provider: every input is a
//! staged file or a value carried across the boundary in [`Compute`], and every failure is a
//! [`ComputeError`].
//!
//! Data flows through the run as owned values, and artifacts are its rims. The staged ingest
//! files map in once at the top - the corpus matrix, the identity table, the endpoint and card
//! columns - and every stage after that consumes the values the stages before it built: the
//! quotient carries both row-domain matrices, the admitted neighbour table feeds the semantic
//! smoothing, the skeleton and the trainer indexes feed the placement. A staging write returns
//! the repository binding the seal publishes, and nothing reads its own staged bytes back
//! mid-run. The deliberate exceptions live in the placement's measurement pass, which re-reads
//! persisted artifacts exactly because the published bytes are what its readings certify.

use burn::backend::libtorch::LibTorchDevice;

#[cfg(test)]
pub(super) use self::projector::inputs::resolve_supplied;
use self::{
    classifier::AcquiredClassifier,
    lod::LevelOfDetail,
    projector::{DistinctInputs, PlacementInputs, StagedPlacement, VerdictResolution},
    quotient::Quotient,
    vector::VectorFile,
};
pub(super) use self::{error::ComputeError, vector::OpenVectorError};
use super::{
    FitConfig, SuppliedVerdicts, ingest::Ingested, prepare::identity::IdentityTableArchive,
    role::Role,
};
use crate::{
    dataset::{OntologyIdentity, PROJECTOR_DIMENSIONS},
    file::{
        generation::{Generation, PublishedGeneration, ScratchDirectory, StagedGeneration},
        identity::{Key, read::IdentityFile},
        repository::{RepositoryFile, RepositoryVersion},
        salt::{
            SaltFiles, SaltRepository,
            metadata::{Evidence, RankingOrigin, Reproducibility, SaltMetadata, Snapshot},
        },
    },
    identity::NodeRowId,
    integrity::Sha256Digest,
    progress::{Progress, Stage},
    salt::policy::{annotation::assembly::AssembledCorpus, classifier::Classifier},
};

mod classifier;
mod coordinates;
mod error;
mod landmark;
mod lod;
mod neighbours;
mod policy;
mod projector;
mod quotient;
mod relation;
mod semantic;
mod vector;

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

/// The places and settings of one compute run.
///
/// Every stage reads the same staged generation, the same scratch directory, the same
/// configuration, and the same device. The run owns them for its whole life and consumes the
/// staged generation at the seal.
pub(super) struct Context {
    /// The staged generation every stage writes into and the seal consumes.
    pub staging: StagedGeneration,
    /// The scratch directory for artifacts that live and die with the run.
    pub scratch: ScratchDirectory,
    /// The fit's configuration, echoed into the metadata.
    pub config: FitConfig,
    /// The device every tensor stage runs on.
    pub device: LibTorchDevice,
}

/// One fit's compute run: the owned inputs the async side hands across the thread boundary.
pub(super) struct Compute {
    /// The run's places and settings.
    pub context: Context,
    /// A fitted model, or the assembled corpus to fit one from.
    pub classifier: ClassifierPlan,
    /// The manifest binding of the supplied reviewed-verdicts file, when the fit received one.
    pub reviewed_verdicts: Option<RepositoryFile>,
    /// The validated supplied reviewed-verdicts document.
    pub verdicts: Option<SuppliedVerdicts>,
    /// The generation seeding reuse, when the fit received one.
    pub prior: Option<Generation>,
    /// The staged stream artifacts and drain facts of the ingest.
    pub ingested: Ingested,
}

impl Compute {
    /// Runs every compute stage over the staged ingest artifacts and seals the generation.
    ///
    /// `I` is the dataset's node id type: the identity artifacts open under it for
    /// prior-landmark translation and the ranking tiebreak. `O` is the dataset's ontology id
    /// type, under which the supplied verdicts resolve.
    ///
    /// # Errors
    ///
    /// Returns the failing stage's [`ComputeError`]. The staging and scratch directories remove
    /// themselves on the early return, so a failed run publishes nothing.
    pub(super) fn run<I, O, P>(self, progress: &P) -> Result<PublishedGeneration, ComputeError>
    where
        I: Key,
        O: Key + OntologyIdentity + Eq + core::hash::Hash,
        P: Progress + Sync,
    {
        let Self {
            context,
            classifier,
            reviewed_verdicts,
            verdicts,
            prior,
            ingested,
        } = self;

        // The boundary map-ins: the corpus matrix, whose file is the data's home for the whole
        // run, and the identity table the prior translation and the ranking tiebreak read.
        let corpus: VectorFile<NodeRowId, PROJECTOR_DIMENSIONS> =
            VectorFile::open(context.staging.path_of(&Role::Representations.file_name()))
                .map_err(ComputeError::OpenRepresentations)?;
        let identities = IdentityTableArchive::<I, NodeRowId>::new(IdentityFile::open(
            context.staging.path_of(&Role::NodeIdentities.file_name()),
        )?)?;

        let quotient =
            Quotient::build(&corpus, &context.scratch).map_err(ComputeError::PersistQuotient)?;

        let acquired = AcquiredClassifier::acquire(&context, &classifier, progress)?;
        let classifier_file = context
            .staging
            .stage(Role::Classifier.file_name(), &acquired.model)?;
        progress.stage_completed(Stage::Classifier);

        let (policies, policy_file, policy_evidence) =
            policy::resolve_table(&context, &acquired.model, &ingested.relations)?;
        progress.stage_completed(Stage::Policy);

        let (adjacency, adjacency_file) = relation::adjacency(&context, corpus.len())?;
        progress.stage_completed(Stage::Adjacency);

        let (corpus_relations, trainer_relations) = relation::indexes(
            &context,
            corpus.len(),
            &quotient,
            &policies,
            &ingested.instances,
            &ingested.multi_typed,
        )?;
        let attraction = context
            .staging
            .stage_with(Role::Attraction.file_name(), |writer| {
                corpus_relations
                    .attraction
                    .write_into(corpus.len() as u64, writer)
            })?;
        let protection = context
            .staging
            .stage(Role::Protection.file_name(), &corpus_relations.protection)?;
        // The corpus indexes are spent once staged: the manifest keeps their measurements, and
        // the placement's paired-movement readout replays from the staged bytes on purpose.
        let relation_measurements = corpus_relations.measurements;
        progress.stage_completed(Stage::Relations);

        let (admitted, recall) = neighbours::admit(&context, &quotient, progress)?;
        // The published table covers the corpus row domain. Under a real quotient every row
        // takes its representative's list, and under the identity the admitted table is already
        // the corpus's own.
        let expanded =
            (!quotient.is_identity()).then(|| quotient.expand_neighbours(&admitted.view()));
        let knn = match &expanded {
            Some(table) => context.staging.stage(Role::Knn.file_name(), table)?,
            None => context.staging.stage(Role::Knn.file_name(), &admitted)?,
        };
        progress.stage_completed(Stage::Knn);

        let (semantic_file, semantic) = semantic::smooth(&context, &admitted, expanded.as_ref())?;
        drop(expanded);
        progress.stage_completed(Stage::Semantic);

        let prior_marks = prior
            .as_ref()
            .map(|generation| landmark::prior_marks::<I>(generation, &identities))
            .transpose()?;
        let (skeleton, landmarks_file, landmark_evidence) =
            landmark::skeleton(&context, &quotient, &semantic, prior_marks.as_ref())?;
        progress.stage_completed(Stage::Landmarks);

        let (snapshot, reproducibility) =
            input_sections(&context.config, prior.as_ref(), &ingested);
        let resolution = VerdictResolution::resolve::<O>(&context, verdicts.as_ref())?;
        let placement = StagedPlacement::stage(
            &context,
            &PlacementInputs {
                skeleton: &skeleton,
                resolution: &resolution,
                snapshot: &snapshot,
                reproducibility: &reproducibility,
                distinct: DistinctInputs {
                    quotient: &quotient,
                    knn: &admitted,
                    semantic: &semantic,
                    indexes: &trainer_relations,
                },
            },
            progress,
        )?;
        progress.stage_completed(Stage::Projector);

        let lod = LevelOfDetail::stage::<I>(
            &context,
            &placement.coordinates,
            &adjacency,
            &identities,
            &ingested.node_types,
            &ingested.type_parents,
        )?;
        progress.stage_completed(Stage::Lod);

        // The seal binds every rim: each staged binding and evidence value enters the
        // repository exactly once, and the sealed document is the generation's identity.
        let (annotation_corpus, annotation_embeddings, annotation_hashes) =
            match acquired.annotation {
                Some(annotation) => (
                    Some(annotation.corpus),
                    Some(annotation.embeddings),
                    Some(annotation.hashes),
                ),
                None => (None, None, None),
            };
        let ranking = RankingOrigin::from(reproducibility.config.ranking);
        let repository = SaltRepository {
            version: RepositoryVersion::V2,
            files: SaltFiles {
                representations: ingested.representations,
                card_embeddings: ingested.cards.embeddings,
                card_hashes: ingested.cards.hashes,
                knn,
                semantic: semantic_file,
                landmarks: landmarks_file,
                classifier: classifier_file,
                policy: policy_file,
                attraction,
                protection,
                coordinates: placement.coordinates.binding,
                morton: lod.files.morton,
                quad: lod.files.quad,
                postings: lod.files.postings,
                wire_coordinates: lod.files.wire_coordinates,
                rank_of_position: lod.files.rank_of_position,
                position_of_rank: lod.files.position_of_rank,
                position_of_row: lod.files.position_of_row,
                row_of_position: lod.files.row_of_position,
                node_identities: ingested.node_identities,
                edge_identities: ingested.edge_identities,
                ontology_identities: ingested.cards.identities,
                edge_endpoints: ingested.edge_endpoints,
                adjacency: adjacency_file,
                projector: placement.checkpoint,
                reviewed_verdicts,
                annotation_corpus,
                annotation_embeddings,
                annotation_hashes,
            },
            metadata: SaltMetadata {
                snapshot,
                reproducibility,
                placement: placement.placement,
                ranking,
                evidence: Evidence {
                    cards: ingested.cards.stats,
                    norm: ingested.norm,
                    recall,
                    landmarks: landmark_evidence,
                    policy: policy_evidence,
                    classifier: acquired.evidence,
                    relations: relation_measurements,
                    lod: lod.evidence,
                    quad: lod.quad,
                    postings: lod.postings,
                    projector: placement.evidence,
                },
            },
        };

        let _span = tracing::info_span!("seal").entered();
        let published = context.staging.seal(&repository)?;
        progress.stage_completed(Stage::Seal);

        Ok(published)
    }
}

/// Builds the metadata document's input sections.
///
/// Built ahead of placement: the paired-movement draw derives its salt from these exact values,
/// and the seal serializes the same ones.
fn input_sections(
    config: &FitConfig,
    prior: Option<&Generation>,
    ingested: &Ingested,
) -> (Snapshot, Reproducibility) {
    (
        Snapshot {
            axes: ingested.axes,
            nodes: ingested.nodes,
            edges: ingested.edges,
            ontology_types: ingested.cards.types,
        },
        Reproducibility {
            config: config.clone(),
            embedder: ingested.fingerprint,
            prior: prior.map(Generation::id),
        },
    )
}
