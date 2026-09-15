//! Generation construction from ingested dataset artifacts.
//!
//! [`Compute::run`] builds the geometry and relation policy, then seals the staged files into a
//! published generation. Run it on a Rayon worker to keep its synchronous CPU and file work off
//! async executor threads. Its inputs consist of owned values and staged files, never a live
//! dataset or embedding provider.
//!
//! # Stage dependencies
//!
//! Placement combines semantic structure with relation constraints. [`classifier`] and [`policy`]
//! determine how to interpret relation types, and [`relation`] builds their attraction and
//! protection indexes. [`neighbours`] constructs and smooths the k-NN table. [`landmark`] derives a
//! layout from that semantic graph, retaining eligible landmarks from the prior generation.
//!
//! [`projector`] produces coordinates using either the trained model or the landmark baseline.
//! [`lod`] then derives the delivery order, spatial index and type postings from the coordinates
//! and corpus topology.
//!
//! # Row domains
//!
//! [`Quotient`] groups byte-identical representations into distinct rows for training. Training
//! indexes and the semantic graph use that distinct-row domain. The published neighbour and
//! semantic artifacts cover corpus rows addressed by [`NodeRowId`]. A stage's in-memory training
//! value can therefore differ from the corpus-domain artifact it stages. [`Staged`] keeps the value
//! and artifact binding separate.
//!
//! # Working data and staged files
//!
//! Representations and node identities remain mapped from the start of the run. Policy and relation
//! preparation open the card and endpoint columns, and verdict resolution opens the ontology
//! identities.
//!
//! The run retains computed products for dependent stages after writing their artifacts. Peak
//! memory includes these retained products alongside the current stage's working storage.
//!
//! Placement reopens its staged coordinates through [`coordinates::Coordinates::open`] to check
//! finiteness before deriving the delivery structure. Ladder measurements also read the staged
//! coordinate and attraction columns to measure the bytes that will publish. Temporary matrices and
//! ladder frames use [`Context::scratch`], separate from the generation's staged artifacts.

#[cfg(test)]
pub(super) use self::projector::error::ProjectorError;
use self::{
    classifier::AcquiredClassifier,
    landmark::{LandmarkSurvey, PriorMarks},
    lod::LevelOfDetail,
    neighbours::NeighbourAdmission,
    policy::PolicyResolution,
    projector::{DistinctInputs, PlacementInputs, PlacementPass},
    quotient::Quotient,
    relation::{AdjacencyDerivation, RelationAssembly},
};
pub(super) use self::{error::ComputeError, projector::inputs::VerdictResolution};
use super::{
    FitConfig, SuppliedVerdicts, ingest::Ingested, prepare::identity::IdentityTableArchive,
};
use crate::{
    dataset::{OntologyIdentity, PROJECTOR_DIMENSIONS},
    device::PhysicalDevice,
    file::{
        ArtifactFile as _,
        generation::{Generation, PublishedGeneration, ScratchDirectory, StagedGeneration},
        identity::{Key, read::IdentityFile},
        repository::{Artifact as _, Binding, RepositoryVersion},
        salt::{
            SaltFiles, SaltRepository, artifact,
            metadata::{Evidence, RankingOrigin, SaltMetadata},
        },
    },
    identity::NodeRowId,
    integrity::Sha256Digest,
    progress::{Progress, Stage},
    salt::{
        file::VectorFile,
        policy::{annotation::assembly::AssembledCorpus, classifier::Classifier},
    },
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

/// A supplied relation classifier or the training material needed to fit one.
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
        /// The assembled training examples and holdout material.
        corpus: Box<AssembledCorpus>,
        /// The SHA-256 of the corpus document's bytes.
        source: Sha256Digest,
        /// The corpus document's staged binding.
        staged: Binding<artifact::AnnotationCorpus>,
    },
}

/// Shared configuration and storage for one generation under construction.
///
/// Stages write publishable artifacts into `staging` and temporary working files into `scratch`.
/// Sealing consumes the staged generation. Dropping the context attempts to remove remaining
/// staging and scratch files.
pub(super) struct Context {
    /// Artifacts awaiting publication as one generation.
    pub staging: StagedGeneration,
    /// Temporary working files to remove when the run ends.
    pub scratch: ScratchDirectory,
    /// Stage settings, also recorded in the generation metadata.
    pub config: FitConfig,
    /// The device for tensor computation.
    pub device: PhysicalDevice,
}

/// A stage result with its artifact binding and recorded evidence.
///
/// `value` supports further computation. `binding` identifies the staged artifact, and `evidence`
/// records the stage's measurements for the repository metadata.
///
/// The value need not be a decoded copy of the artifact. For example, semantic smoothing returns a
/// distinct-row training graph while staging the corpus-domain graph when [`Quotient`] groups
/// duplicate representations.
pub(super) struct Staged<V, A, E> {
    /// The in-memory result available to later stages.
    pub value: V,
    /// The staged file's typed repository binding.
    pub binding: Binding<A>,
    /// The stage's evidence for the metadata document.
    pub evidence: E,
}

/// Owned inputs for completing a fit after dataset ingestion.
pub(super) struct Compute {
    /// Storage, configuration and device shared by the stages.
    pub context: Context,
    /// A fitted model, or the assembled corpus to fit one from.
    pub classifier: ClassifierPlan,
    /// The manifest binding of the supplied reviewed-verdicts file, when the fit received one.
    pub reviewed_verdicts: Option<Binding<artifact::ReviewedVerdicts>>,
    /// The validated supplied reviewed-verdicts document.
    pub verdicts: Option<SuppliedVerdicts>,
    /// The generation seeding reuse, when the fit received one.
    pub prior: Option<Generation>,
    /// Ingested artifact bindings, row-aligned type columns and input measurements.
    pub ingested: Ingested,
}

impl Compute {
    /// Builds the remaining artifacts and publishes the completed generation.
    ///
    /// `I` and `O` must be the ingested dataset's node and ontology identity types. Node identities
    /// support prior-landmark translation and ranking tiebreaks. Ontology identities resolve the
    /// supplied verdicts against the staged ontology table.
    ///
    /// Success returns a durable [`PublishedGeneration`]. Publication does not activate it for
    /// serving.
    ///
    /// # Errors
    ///
    /// Returns [`ComputeError`] for a failed stage, artifact operation or seal. Every error before
    /// the seal's rename leaves nothing published. A [`ComputeError::Seal`] from opening or syncing
    /// the root after the rename leaves the generation directory visible.
    ///
    /// On an early return, the staging and scratch directories attempt cleanup and log any cleanup
    /// failures.
    ///
    /// # Panics
    ///
    /// Propagates panics from compute stages, including the input and scratch-file conditions of
    /// [`Quotient::build`] and [`PlacementPass::run`]. A `progress` callback can also panic,
    /// including the seal-completion callback after publication.
    #[expect(
        clippy::too_many_lines,
        reason = "the run is the fit's one straight line, and splitting it would scatter the data \
                  flow it exists to show"
    )]
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

        // retain the corpus mapping while later stages borrow its representations. Node identities
        // translate prior landmarks and break ranking ties.
        let corpus: VectorFile<NodeRowId, PROJECTOR_DIMENSIONS> =
            VectorFile::open(context.staging.path_of(&artifact::Representations::NAME))
                .map_err(ComputeError::OpenRepresentations)?;
        let identities = IdentityTableArchive::<I, NodeRowId>::new(IdentityFile::open(
            context.staging.path_of(&artifact::NodeIdentities::NAME),
        )?)?;

        let quotient =
            Quotient::build(&corpus, &context.scratch).map_err(ComputeError::PersistQuotient)?;

        let acquired = AcquiredClassifier::acquire(&context, &classifier, progress)?;
        let classifier_file = context
            .staging
            .stage(artifact::Classifier, &acquired.model)?;
        progress.stage_completed(Stage::Classifier);

        let policy = PolicyResolution::new(&context, &acquired.model, &ingested.relations).run()?;
        progress.stage_completed(Stage::Policy);

        let adjacency = AdjacencyDerivation::new(&context, corpus.len()).run()?;
        progress.stage_completed(Stage::Adjacency);

        let (relations, trainer_relations) = RelationAssembly::new(
            &context,
            corpus.len(),
            &quotient,
            &policy.value,
            &ingested.instances,
            &ingested.multi_typed,
        )
        .run()?;
        progress.stage_completed(Stage::Relations);

        let (neighbourhood, expansion) =
            NeighbourAdmission::new(&context, &quotient).run(progress)?;
        progress.stage_completed(Stage::Knn);

        let semantic = neighbourhood
            .smooth(&context, expansion)
            .map_err(ComputeError::Semantic)?;
        progress.stage_completed(Stage::Semantic);

        let prior_marks = prior
            .as_ref()
            .map(|generation| PriorMarks::translated::<I>(generation, &identities))
            .transpose()?;
        let skeleton =
            LandmarkSurvey::new(&context, &quotient, &semantic.value, prior_marks.as_ref())
                .run()?;
        progress.stage_completed(Stage::Landmarks);

        // construct these before placement: paired-movement sampling derives its salt from the same
        // snapshot and configuration that the metadata records.
        let dataset = ingested.origin;
        let snapshot = ingested.snapshot();
        let reproducibility = ingested.reproducibility(context.config.clone(), prior.as_ref());
        let resolution = VerdictResolution::resolve::<O>(
            &context.staging,
            &ingested.cards.identities,
            verdicts.as_ref(),
        )?;
        let placement_inputs = PlacementInputs {
            skeleton: &skeleton.value,
            resolution: &resolution,
            snapshot: &snapshot,
            reproducibility: &reproducibility,
            distinct: DistinctInputs {
                quotient: &quotient,
                knn: &neighbourhood.admitted,
                semantic: &semantic.value,
                indexes: &trainer_relations,
            },
        };
        let placement = PlacementPass::new(&context, &placement_inputs)?.run(progress)?;
        progress.stage_completed(Stage::Projector);

        let lod = LevelOfDetail::new(
            &placement.coordinates,
            &adjacency.value,
            &identities,
            &ingested.node_types,
            &ingested.type_parents,
        )
        .run(&context.config)?
        .stage(&context.staging)?;
        progress.stage_completed(Stage::Lod);

        // the repository records both artifact digests and fit evidence. Its serialized bytes
        // determine the generation ID.
        let (annotation_corpus, annotation_embeddings, annotation_hashes) = acquired
            .annotation
            .map_or((None, None, None), |annotation| {
                (
                    Some(annotation.corpus),
                    Some(annotation.embeddings),
                    Some(annotation.hashes),
                )
            });
        let ranking = RankingOrigin::from(reproducibility.config.ranking);
        let repository = SaltRepository {
            version: RepositoryVersion::V2,
            files: SaltFiles {
                representations: ingested.representations,
                card_embeddings: ingested.cards.embeddings,
                card_hashes: ingested.cards.hashes,
                knn: neighbourhood.binding,
                semantic: semantic.binding,
                landmarks: skeleton.binding,
                classifier: classifier_file,
                policy: policy.binding,
                attraction: relations.attraction,
                protection: relations.protection,
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
                adjacency: adjacency.binding,
                projector: placement.checkpoint,
                reviewed_verdicts,
                annotation_corpus,
                annotation_embeddings,
                annotation_hashes,
            },
            metadata: SaltMetadata {
                snapshot,
                reproducibility,
                dataset: Some(dataset),
                placement: placement.kind,
                ranking,
                evidence: Evidence {
                    cards: ingested.cards.stats,
                    norm: ingested.norm,
                    recall: neighbourhood.recall,
                    landmarks: skeleton.evidence,
                    policy: policy.evidence,
                    classifier: acquired.evidence,
                    relations: relations.measurements,
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
