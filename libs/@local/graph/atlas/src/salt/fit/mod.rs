//! The fit pipeline: one dataset in, one published generation out.
//!
//! [`fit`] runs every stage of one SALT fit over a [`Dataset`], writes
//! each artifact into a staging directory as its stage completes, and
//! seals the result into an atomically published generation. This module
//! owns exactly the dataset-to-artifact plumbing; the stages themselves
//! are libraries under [`crate::salt`], consumed here.
//!
//! # Memory discipline
//!
//! Every corpus-scale stage output is written to its staged file and
//! mapped back before the next stage reads it: owned `N`-scale values
//! are construction-transient, dropped at stage exit, and the pipeline's
//! peak residency is one stage's working set, not the sum. The mapped
//! views stay cheap because their pages are freshly written and, under
//! pressure, evictable. Config-bounded `M`-scale values (the landmark
//! selection, the quotient graph) stay resident within the run.
//!
//! # Seeds
//!
//! One seed enters through [`FitConfig`]; each randomized stage draws
//! its generator from a named derivation of it. Naming makes the
//! derivation insertion-stable: adding or removing a stage never shifts
//! another stage's randomness, which a shared drawn-in-order stream
//! cannot promise.
//!
//! # Failure
//!
//! Any stage error, failed admission check, or write failure aborts the
//! run and publishes nothing; the staging and scratch directories remove
//! themselves. A generation therefore exists exactly when every stage
//! and every check of one run passed.

use alloc::collections::BTreeSet;
use core::{num::NonZero, pin::pin};
use std::{
    fs::File,
    io::{self, BufWriter, Write as _},
};

use camino::Utf8Path;
use futures::TryStreamExt as _;
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;
use tracing::Instrument as _;
use zerocopy::IntoBytes as _;

use self::prepare::{
    PrepareError,
    identity::{IdentityTable, MappedIdentityTable},
    norm,
};
pub(crate) use self::{
    echo::FitConfigDef,
    error::{FitError, PriorError},
};
use crate::{
    bitset::BitSet,
    dataset::{CANONICAL_DIMENSIONS, Dataset, NodeRowId, OntologyRowId, PROJECTOR_DIMENSIONS},
    file::{
        array::{ArrayFile, ArrayVariant, ArrayWriter, Dim},
        generation::{
            Generation, GenerationRoot, PublishedGeneration, ScratchDirectory, StagedGeneration,
        },
        identity::read::IdentityFile,
        landmark::read::LandmarkFile,
        repository::{FileName, RepositoryFile, RepositoryVersion},
        salt::{
            SaltFiles, SaltRepository,
            metadata::{
                Evidence, LandmarkEvidence, Placement, PolicyEvidence, Reproducibility,
                SaltMetadata, Snapshot,
            },
        },
        sprs::read::SprsFile,
    },
    integrity::{Sha256, Sha256Digest, Update as _, Writer},
    math::{AffinityCurve, AlignedVecN},
    salt::{
        embedding::{CardEmbedder, CardEmbeddingStats, CardEmbeddingView, embed_cards},
        knn::{
            self, Embedding, NearestNeighboursIndex as _,
            artifact::MappedKnn,
            hannoy::{HannoyIndex, HannoyIndexOptions},
            recall,
            table::Knn,
        },
        landmark::{
            artifact::{LandmarkSkeleton, MappedLandmarkSkeleton},
            assignment::assign_landmarks,
            layout::{LayoutOptions, layout_landmarks},
            quotient::{QuotientOptions, quotient_graph},
            select::{
                LandmarkCandidate, SamplingWeight, SelectionOptions, SubgroupAxes, select_landmarks,
            },
        },
        policy::{
            Classification, CoincidentAdmission, PolicyOverride, artifact::write_policies,
            classifier::Classifier, resolve,
        },
        semantic::{SemanticGraph, SmoothingOptions, artifact::MappedSemanticGraph},
    },
};

#[cfg(feature = "bench")]
pub mod bench;
mod echo;
mod error;
pub(crate) mod prepare;

#[cfg(test)]
mod tests;

/// Policy resolution inputs of one fit.
///
/// The overrides supersede classifier predictions by precedence and
/// must name relation types the edge stream carries: an override for a
/// relation without edges contradicts the corpus and aborts the fit at
/// resolution.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct PolicyOptions {
    /// Higher-precedence policy records superseding classifier
    /// predictions.
    pub overrides: Vec<PolicyOverride> = Vec::new(),
    /// The generation's Coincident admission criteria.
    pub admission: CoincidentAdmission = CoincidentAdmission::default(),
}

const impl Default for PolicyOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// Every setting of one fit, valid by construction.
///
/// Stage options keep their own documented defaults; the fields without
/// defaults are the choices no fit can imply: the seed, the landmark
/// capacity, and the low-dimensional kernel.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct FitConfig {
    /// The fit's seed; every stage generator derives from it by name.
    pub seed: u64,
    /// Landmark capacity and retention.
    pub selection: SelectionOptions,
    /// The fitted low-dimensional affinity kernel
    /// ([`AffinityCurve::fit`]).
    pub curve: AffinityCurve,
    /// The representation-contract spot check.
    pub norm_check: norm::SpotCheckOptions = norm::SpotCheckOptions::default(),
    /// Stored neighbours per row of the k-NN table.
    pub neighbours: NonZero<usize> = knn::DEFAULT_NEIGHBOURS,
    /// The HNSW backend serving the k-NN and assignment searches.
    pub index: HannoyIndexOptions = HannoyIndexOptions::default(),
    /// The exact-recall spot check admitting the backend.
    pub recall_check: recall::SpotCheckOptions = recall::SpotCheckOptions::default(),
    /// Membership smoothing of the semantic graph.
    pub smoothing: SmoothingOptions = SmoothingOptions::default(),
    /// Quotient-graph contraction bounds.
    pub quotient: QuotientOptions = QuotientOptions::default(),
    /// The landmark layout schedule.
    pub layout: LayoutOptions = LayoutOptions::default(),
    /// Policy overrides and admission criteria.
    pub policy: PolicyOptions = PolicyOptions::default(),
}

/// The randomized stages, each naming its seed derivation.
///
/// The name string is the derivation preimage and therefore pinned:
/// renaming a variant never moves a stage's randomness, only editing
/// its pinned string does.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Stage {
    NormCheck,
    KnnLink,
    RecallCheck,
    LandmarkSelection,
    LandmarkAssignment,
    LandmarkLayout,
}

impl Stage {
    /// Returns the pinned derivation name.
    const fn name(self) -> &'static str {
        match self {
            Self::NormCheck => "norm-check",
            Self::KnnLink => "knn-link",
            Self::RecallCheck => "recall-check",
            Self::LandmarkSelection => "landmark-selection",
            Self::LandmarkAssignment => "landmark-assignment",
            Self::LandmarkLayout => "landmark-layout",
        }
    }
}

/// The artifact roles one fit stages, each with its pinned file name.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Role {
    Representations,
    CardEmbeddings,
    CardHashes,
    Knn,
    Semantic,
    Landmarks,
    Classifier,
    Policy,
    Coordinates,
    NodeIdentities,
    EdgeIdentities,
}

impl Role {
    /// Returns the role's staged file name.
    const fn file_name(self) -> FileName {
        match self {
            Self::Representations => FileName::pinned("representations.arr"),
            Self::CardEmbeddings => FileName::pinned("card-embeddings.arr"),
            Self::CardHashes => FileName::pinned("card-hashes.arr"),
            Self::Knn => FileName::pinned("knn.sprs"),
            Self::Semantic => FileName::pinned("semantic.sprs"),
            Self::Landmarks => FileName::pinned("landmarks.lndm"),
            Self::Classifier => FileName::pinned("classifier.clsf"),
            Self::Policy => FileName::pinned("policy.plcy"),
            Self::Coordinates => FileName::pinned("coordinates.arr"),
            Self::NodeIdentities => FileName::pinned("node-identities.idnt"),
            Self::EdgeIdentities => FileName::pinned("edge-identities.idnt"),
        }
    }

    /// Binds the role's file name to its written digest.
    const fn file(self, hash: Sha256Digest) -> RepositoryFile {
        RepositoryFile {
            name: self.file_name(),
            hash,
        }
    }
}

// Every pinned name validates at compile time.
const _: [FileName; 11] = [
    Role::Representations.file_name(),
    Role::CardEmbeddings.file_name(),
    Role::CardHashes.file_name(),
    Role::Knn.file_name(),
    Role::Semantic.file_name(),
    Role::Landmarks.file_name(),
    Role::Classifier.file_name(),
    Role::Policy.file_name(),
    Role::Coordinates.file_name(),
    Role::NodeIdentities.file_name(),
    Role::EdgeIdentities.file_name(),
];

/// Derives one stage's generator from the fit seed and the stage's
/// pinned name.
///
/// The full 32-byte digest seeds the generator, so a derived stream
/// keeps the derivation's whole entropy.
fn stage_rng(seed: u64, stage: Stage) -> Xoshiro256PlusPlus {
    let mut hasher = Sha256::new();
    #[expect(
        clippy::little_endian_bytes,
        reason = "the derivation preimage pins the canonical little-endian bytes"
    )]
    hasher.update(&seed.to_le_bytes());
    hasher.update(stage.name().as_bytes());

    Xoshiro256PlusPlus::from_seed(hasher.finalize().to_bytes())
}

/// Runs `write` against the role's buffered staged file, surfacing
/// flush errors, and binds the written digest to the role.
fn write_staged(
    staging: &StagedGeneration,
    role: Role,
    write: impl FnOnce(&mut BufWriter<File>) -> io::Result<Sha256Digest>,
) -> io::Result<RepositoryFile> {
    let mut writer = BufWriter::new(staging.create(&role.file_name())?);
    let digest = write(&mut writer)?;
    writer.flush()?;

    Ok(role.file(digest))
}

/// Returns the SHA-256 of the file at `path`, streaming its bytes.
fn digest_file(path: impl AsRef<Utf8Path>) -> io::Result<Sha256Digest> {
    let path = path.as_ref();
    let _span = tracing::info_span!("digest", file = %path).entered();

    let mut writer = Writer {
        accumulator: Sha256::new(),
        writer: io::sink(),
    };
    io::copy(&mut File::open(path)?, &mut writer)?;

    Ok(writer.accumulator.finalize())
}

/// Runs one fit over the dataset and publishes the generation.
///
/// The stages run in the dataset's documented ingest order - nodes,
/// edges, ontology - with every artifact staged in place, so the
/// returned generation is complete, durable, and verifiable against its
/// metadata document. Activation stays with the caller: publishing a
/// generation and serving it are separate decisions.
///
/// The `classifier` is a supplied input: a freshly fitted model or a
/// prior generation's artifact read back
/// ([`Classifier::from_artifact`]). It classifies every relation
/// type's card, and the resolved policy table publishes beside it.
///
/// A `prior` generation seeds reuse: card texts whose hash appears in
/// its card table keep their embeddings without touching the provider
/// (under a matching embedder fingerprint), and its landmarks compete
/// for the retained share of the new selection, translated across
/// snapshots through the identity artifacts. The metadata records
/// which generation seeded the run.
///
/// # Errors
///
/// Returns an error when the dataset or embedding provider fails, a
/// stage rejects its input, an admission check fails
/// ([`FitError::RepresentationDefects`],
/// [`FitError::RecallBelowMinimum`]), a write, map, or publish step
/// fails, or the offered prior's artifacts cannot serve reuse
/// ([`FitError::Prior`]). Nothing is published on any error.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
#[expect(
    clippy::too_many_lines,
    reason = "the fit is one linear stage transaction; every stage body is already extracted"
)]
pub(crate) async fn fit<D, E>(
    dataset: &D,
    embedder: &E,
    config: &FitConfig,
    classifier: &Classifier,
    prior: Option<&Generation>,
    root: &GenerationRoot,
) -> Result<PublishedGeneration, FitError<D::Error, E::Error>>
where
    D: Dataset,
    E: CardEmbedder + Sync,
{
    let staging = root.stage()?;
    let scratch = root.scratch()?;

    // Nodes: stream every representation into the staged matrix beside
    // its identity table, map the matrix back, and certify the source
    // contract on the mapped rows.
    let (nodes, representations_file, node_identities_file) =
        stage_representations(dataset, &staging)
            .instrument(tracing::info_span!("representations"))
            .await?;
    tracing::info!(nodes, "staged the node representations and identities");

    let representations = ArrayFile::open(staging.path_of(&Role::Representations.file_name()))
        .map_err(FitError::MapRepresentations)?;
    let rows: &[AlignedVecN<PROJECTOR_DIMENSIONS>] = representations
        .vectors()
        .expect("the representation matrix was sealed as f32 rows of the projector width");

    let norm = certify_representations::<D::Error, E::Error>(rows, config)?;

    // Edges: the identity column and the relation universe are drained;
    // the endpoint columns, the adjacency the serving contract wants,
    // and the relation stage rework land together.
    // TODO: persist the endpoint columns and the incident-edge
    //       adjacency, and assemble `RelationInstance`s from this
    //       stream against the staged policy table (the attraction
    //       writer already landed).
    let (edges, relations, edge_identities_file) = stage_edge_identities(dataset, &staging)
        .instrument(tracing::info_span!("edge-identities"))
        .await?;
    tracing::info!(edges, "staged the edge identities");

    // Ontology: render every card and embed the unique texts, reusing
    // the prior generation's rows where the text hash matches.
    let cards = embed_card_table(dataset, embedder, &staging, prior)
        .instrument(tracing::info_span!("cards"))
        .await?;
    tracing::info!(
        types = cards.types,
        reused = cards.stats.reused,
        embedded = cards.stats.embedded,
        "staged the card-embedding table"
    );

    // Policy: classify every relation type's card and resolve the
    // certified policy table beside the classifier that produced it.
    let (classifier_file, policy_file, policy_evidence) =
        stage_policy(&staging, config, classifier, &relations)?;
    tracing::info!(
        relations = policy_evidence.relations,
        overridden = policy_evidence.overridden,
        "staged the classifier and the resolved policy table"
    );

    // Neighbours: build the search backend, admit it by exact recall,
    // and derive the persisted table from it.
    let (recall, knn_file) = build_neighbour_table(&staging, &scratch, config, rows)?;
    let knn = MappedKnn::new(SprsFile::open(staging.path_of(&Role::Knn.file_name()))?)
        .map_err(FitError::InvalidKnn)?;
    tracing::info!(recall = recall.recall(), "staged the admitted k-NN table");

    // Semantic graph: smooth the mapped table into fuzzy memberships.
    let semantic_file = {
        let _span = tracing::info_span!("semantic").entered();
        let graph = SemanticGraph::build(&knn.view(), config.smoothing);
        write_staged(&staging, Role::Semantic, |writer| graph.write_into(writer))?
    };
    let semantic = MappedSemanticGraph::new(SprsFile::open(
        staging.path_of(&Role::Semantic.file_name()),
    )?)
    .map_err(FitError::InvalidSemantic)?;
    tracing::info!("staged the semantic graph");

    // Landmarks: select, assign, contract, and lay out the skeleton.
    // The prior generation's landmarks translate to current rows
    // through the identity artifacts and compete for the retained
    // share of the selection.
    let prior_marks = prior
        .map(|generation| prior_landmark_marks::<D, E::Error>(generation, &staging))
        .transpose()?;

    let (landmarks_file, landmark_evidence) = build_landmark_skeleton(
        &staging,
        &scratch,
        config,
        rows,
        &semantic,
        prior_marks.as_ref(),
    )?;
    let skeleton = MappedLandmarkSkeleton::new(LandmarkFile::open(
        staging.path_of(&Role::Landmarks.file_name()),
    )?)
    .map_err(FitError::InvalidLandmarks)?;
    tracing::info!(
        selected = landmark_evidence.selected,
        "staged the landmark skeleton"
    );

    // Placement baseline: every row takes its assigned landmark's layout
    // coordinate.
    // TODO: the trained projector replaces this placer at the same
    //       artifact seam; the metadata's `Placement` records which one
    //       ran.
    let coordinates_file = stage_baseline_coordinates(&staging, &skeleton)?;
    tracing::info!("staged the baseline coordinates");

    // TODO: the attraction and protection roles join `SaltFiles` when
    //       the relation stage wires in at the edge drain.
    let repository = SaltRepository {
        version: RepositoryVersion::V0,
        files: SaltFiles {
            representations: representations_file,
            card_embeddings: cards.embeddings,
            card_hashes: cards.hashes,
            knn: knn_file,
            semantic: semantic_file,
            landmarks: landmarks_file,
            classifier: classifier_file,
            policy: policy_file,
            coordinates: coordinates_file,
            node_identities: node_identities_file,
            edge_identities: edge_identities_file,
        },
        metadata: SaltMetadata {
            snapshot: Snapshot {
                axes: dataset.axes(),
                nodes,
                edges,
                ontology_types: cards.types,
            },
            reproducibility: Reproducibility {
                config: config.clone(),
                embedder: embedder.fingerprint(),
                prior: prior.map(Generation::id),
            },
            placement: Placement::LandmarkBaseline,
            evidence: Evidence {
                cards: cards.stats,
                norm,
                recall,
                landmarks: landmark_evidence,
                policy: policy_evidence,
            },
        },
    };

    let _span = tracing::info_span!("seal").entered();
    staging.seal(&repository).map_err(FitError::Seal)
}

/// Streams every node's representation into the staged `f32[N, 512]`
/// matrix and its ids into the staged identity file, returning the row
/// count with both staged files.
///
/// The matrix digest streams over the finished file because the writer
/// seals its header by seeking; the identity writer is forward-only
/// and digests inline.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
async fn stage_representations<D, E>(
    dataset: &D,
    staging: &StagedGeneration,
) -> Result<(u64, RepositoryFile, RepositoryFile), FitError<D::Error, E>>
where
    D: Dataset,
{
    let mut writer = BufWriter::new(staging.create(&Role::Representations.file_name())?);
    let ids = prepare::write_node_representations(dataset, &mut writer)
        .instrument(tracing::info_span!("stream"))
        .await
        .map_err(|error| match error {
            PrepareError::Dataset(error) => FitError::Dataset(error),
            PrepareError::Io(error) => FitError::Io(error),
        })?;
    writer.flush()?;

    let nodes = ids.len();
    let identities = write_staged(staging, Role::NodeIdentities, |writer| {
        ids.write_into(writer)
    })?;

    let digest = digest_file(staging.path_of(&Role::Representations.file_name()))?;

    Ok((nodes, Role::Representations.file(digest), identities))
}

/// Certifies the source contract on the mapped representation rows,
/// returning the passing evidence.
fn certify_representations<D, E>(
    rows: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    config: &FitConfig,
) -> Result<norm::NormSpotCheck, FitError<D, E>> {
    let _span = tracing::info_span!("norm-check").entered();

    let norm = norm::spot_check(
        rows,
        config.norm_check,
        stage_rng(config.seed, Stage::NormCheck),
    )?;
    if !norm.passes() {
        return Err(FitError::RepresentationDefects(norm));
    }
    tracing::info!(
        sampled = norm.sampled_rows,
        "the representations passed the norm spot check"
    );

    Ok(norm)
}

/// Streams every edge's id into the staged identity file, returning
/// the edge count, the relation universe - the distinct ontology rows
/// the edges carried, ascending - and the staged file.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
async fn stage_edge_identities<D, E>(
    dataset: &D,
    staging: &StagedGeneration,
) -> Result<(u64, Vec<OntologyRowId>, RepositoryFile), FitError<D::Error, E>>
where
    D: Dataset,
{
    let mut ids = IdentityTable::new();
    let mut relations = BTreeSet::new();
    let mut stream = pin!(dataset.edges());

    while let Some(edge) = stream.try_next().await.map_err(FitError::Dataset)? {
        ids.push(edge.id);
        relations.extend(edge.ontology.iter().map(|relation| relation.get()));
    }

    let file = write_staged(staging, Role::EdgeIdentities, |writer| {
        ids.write_into(writer)
    })?;

    Ok((
        ids.len(),
        relations.into_iter().map(OntologyRowId::new).collect(),
        file,
    ))
}

/// Marks the current rows whose nodes were landmarks of the prior
/// generation.
///
/// The prior skeleton's rows translate through the prior identity
/// table to source ids and through the staged current table back to
/// rows; nodes that left the corpus since the prior generation simply
/// mark nothing.
fn prior_landmark_marks<D, E>(
    prior: &Generation,
    staging: &StagedGeneration,
) -> Result<BitSet, FitError<D::Error, E>>
where
    D: Dataset,
{
    let _span = tracing::info_span!("prior-marks").entered();

    let files = &prior.repository().files;
    let skeleton = MappedLandmarkSkeleton::new(
        LandmarkFile::open(prior.path_of(&files.landmarks.name))
            .map_err(PriorError::MapLandmarks)?,
    )
    .map_err(PriorError::InvalidLandmarks)?;
    let prior_ids = MappedIdentityTable::<D::NodeId>::new(
        IdentityFile::open(prior.path_of(&files.node_identities.name))
            .map_err(PriorError::MapIdentities)?,
    )
    .map_err(PriorError::InvalidIdentities)?;

    let current = MappedIdentityTable::<D::NodeId>::new(
        IdentityFile::open(staging.path_of(&Role::NodeIdentities.file_name()))
            .map_err(FitError::MapIdentities)?,
    )
    .map_err(FitError::InvalidIdentities)?;

    let mut marks =
        BitSet::new(usize::try_from(current.len()).expect("rows fit the address space"));
    for &row in skeleton.selected_rows() {
        let id = prior_ids
            .id(row.get())
            .ok_or_else(|| PriorError::SkeletonBeyondIdentities { row: row.get() })?;
        if let Some(current_row) = current.row_of(id) {
            marks.insert(usize::try_from(current_row).expect("rows fit the address space"));
        }
    }
    tracing::info!(
        prior_landmarks = marks.count(),
        "translated the prior landmarks onto the current corpus"
    );

    Ok(marks)
}

/// The staged card-embedding artifacts of one fit.
struct CardArtifacts {
    /// Ontology types embedded: the row count of both staged files.
    types: u64,
    /// The staged embedding matrix.
    embeddings: RepositoryFile,
    /// The staged text-hash column.
    hashes: RepositoryFile,
    /// How the rows were obtained; metadata evidence.
    stats: CardEmbeddingStats,
}

/// Renders every card, embeds the unique texts, and stages the two
/// card-embedding columns.
///
/// A prior generation's card files map back as the reuse table:
/// texts whose hash appears there keep their rows without touching
/// the provider. Reuse is fingerprint-guarded inside [`embed_cards`],
/// so a changed embedding contract re-embeds everything.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
async fn embed_card_table<D, E>(
    dataset: &D,
    embedder: &E,
    staging: &StagedGeneration,
    prior: Option<&Generation>,
) -> Result<CardArtifacts, FitError<D::Error, E::Error>>
where
    D: Dataset,
    E: CardEmbedder + Sync,
{
    let cards = async {
        let mut stream = pin!(dataset.render_cards());
        let mut cards = Vec::new();
        while let Some((_, card)) = stream.try_next().await.map_err(FitError::Cards)? {
            cards.push(card);
        }
        Ok::<_, FitError<D::Error, E::Error>>(cards)
    }
    .instrument(tracing::info_span!("render-cards"))
    .await?;

    let types = cards.len() as u64;

    let prior_files = prior
        .map(|generation| -> Result<_, PriorError> {
            let files = &generation.repository().files;
            let hashes = ArrayFile::open(generation.path_of(&files.card_hashes.name))
                .map_err(PriorError::MapCards)?;
            let embeddings = ArrayFile::open(generation.path_of(&files.card_embeddings.name))
                .map_err(PriorError::MapCards)?;
            Ok((
                hashes,
                embeddings,
                generation.repository().metadata.reproducibility.embedder,
            ))
        })
        .transpose()?;
    let prior_view = prior_files
        .as_ref()
        .map(
            |(hashes, embeddings, fingerprint)| -> Result<_, PriorError> {
                CardEmbeddingView::new(
                    *fingerprint,
                    hashes.digests().ok_or(PriorError::MalformedCards)?,
                    embeddings
                        .f32_elements()
                        .ok_or(PriorError::MalformedCards)?,
                )
                .ok_or(PriorError::MalformedCards)
            },
        )
        .transpose()?;

    let (table, stats) = embed_cards(embedder, &cards, prior_view)
        .instrument(tracing::info_span!("embed"))
        .await
        .map_err(FitError::Embedding)?;
    drop(cards);

    let embeddings = write_staged(staging, Role::CardEmbeddings, |writer| {
        table.write_embeddings_into(writer)
    })?;
    let hashes = write_staged(staging, Role::CardHashes, |writer| {
        table.write_hashes_into(writer)
    })?;

    Ok(CardArtifacts {
        types,
        embeddings,
        hashes,
        stats,
    })
}

/// Classifies every relation type's card, resolves the policy table,
/// and stages the classifier beside it.
///
/// The relation universe is the distinct ontology rows the edge stream
/// carried; each indexes the staged card table, which is row-aligned
/// with the type table. Every card exists, so every relation
/// classifies; the Overlay fallback for unclassifiable relations stays
/// reserved for datasets that cannot render a card.
fn stage_policy<D, E>(
    staging: &StagedGeneration,
    config: &FitConfig,
    classifier: &Classifier,
    relations: &[OntologyRowId],
) -> Result<(RepositoryFile, RepositoryFile, PolicyEvidence), FitError<D, E>> {
    let _span = tracing::info_span!("policy").entered();

    let classifier_file = write_staged(staging, Role::Classifier, |writer| {
        classifier.write_into(writer)
    })?;

    let cards = ArrayFile::open(staging.path_of(&Role::CardEmbeddings.file_name()))
        .map_err(FitError::MapCards)?;
    let embeddings: &[AlignedVecN<CANONICAL_DIMENSIONS>] = cards
        .vectors()
        .expect("the card matrix was sealed as f32 rows of the canonical width");

    let classifications = relations
        .iter()
        .map(|&relation| {
            classifier
                .predict(&embeddings[relation.usize()])
                .map(|prediction| (relation, Classification::Predicted(prediction)))
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(FitError::Classify)?;

    let policies = resolve(
        &classifications,
        &config.policy.overrides,
        config.policy.admission,
    )
    .map_err(FitError::Policy)?;

    let policy_file = write_staged(staging, Role::Policy, |writer| {
        write_policies(&policies, writer)
    })?;

    let overridden = config
        .policy
        .overrides
        .iter()
        .map(|record| record.relation.get())
        .collect::<BTreeSet<_>>()
        .len() as u64;

    Ok((
        classifier_file,
        policy_file,
        PolicyEvidence {
            relations: policies.len() as u64,
            overridden,
        },
    ))
}

/// Builds the search backend over the mapped representations, admits it
/// by exact recall, and stages the derived k-NN table.
fn build_neighbour_table<D, E>(
    staging: &StagedGeneration,
    scratch: &ScratchDirectory,
    config: &FitConfig,
    rows: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
) -> Result<(recall::RecallSpotCheck, RepositoryFile), FitError<D, E>> {
    let _span = tracing::info_span!("knn").entered();

    let mut index = HannoyIndex::new(scratch.directory("knn")?, config.index)?;
    {
        let _span = tracing::info_span!("knn-link").entered();
        index.insert_many(rows.iter().enumerate().map(|(row, components)| Embedding {
            id: NodeRowId::new(row as u64),
            components,
        }))?;
        index.build(stage_rng(config.seed, Stage::KnnLink))?;
    }

    let recall = tracing::info_span!("recall-check")
        .in_scope(|| {
            recall::spot_check(
                &index,
                rows,
                config.recall_check,
                stage_rng(config.seed, Stage::RecallCheck),
            )
        })
        .map_err(FitError::RecallCheck)?;
    if !recall.meets_minimum() {
        return Err(FitError::RecallBelowMinimum(recall));
    }

    let file = {
        let _span = tracing::info_span!("knn-table").entered();
        let table = Knn::build(&index, rows.len(), config.neighbours).map_err(FitError::Knn)?;
        write_staged(staging, Role::Knn, |writer| table.write_into(writer))?
    };

    Ok((recall, file))
}

/// Selects, assigns, contracts, and lays out the landmark skeleton,
/// staging it as one combined file.
///
/// Candidates are uniform over the corpus; `prior_marks` names the
/// rows competing for the retained share.
// TODO: candidates take stratification axes and subgroup minimums once
//       a stage computes them.
fn build_landmark_skeleton<D, E>(
    staging: &StagedGeneration,
    scratch: &ScratchDirectory,
    config: &FitConfig,
    rows: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    semantic: &MappedSemanticGraph,
    prior_marks: Option<&BitSet>,
) -> Result<(RepositoryFile, LandmarkEvidence), FitError<D, E>> {
    let _span = tracing::info_span!("landmarks").entered();

    let selection = {
        let _span = tracing::info_span!("landmark-selection").entered();
        let candidates: Vec<LandmarkCandidate> = (0..rows.len())
            .map(|row| LandmarkCandidate {
                row: NodeRowId::new(row as u64),
                sampling_weight: SamplingWeight::UNIFORM,
                axes: SubgroupAxes::default(),
                prior_landmark: prior_marks.is_some_and(|marks| marks.contains(row)),
            })
            .collect();
        select_landmarks(
            &candidates,
            &[],
            config.selection,
            stage_rng(config.seed, Stage::LandmarkSelection),
        )?
    };

    #[expect(
        clippy::cast_possible_truncation,
        reason = "the selection count is bounded by the u32 landmark capacity"
    )]
    let evidence = LandmarkEvidence {
        selected: selection.len() as u32,
        retained: selection.retained_count() as u32,
        layout_epochs: config.layout.epochs,
    };

    let assignment = {
        let _span = tracing::info_span!("landmark-assignment").entered();
        let mut index = HannoyIndex::new(scratch.directory("assignment")?, config.index)?;
        assign_landmarks(
            &mut index,
            stage_rng(config.seed, Stage::LandmarkAssignment),
            rows,
            &selection,
        )?
    };

    let quotient = tracing::info_span!("quotient")
        .in_scope(|| quotient_graph(&semantic.view(), &assignment, config.quotient))?;
    let coordinates = tracing::info_span!("landmark-layout").in_scope(|| {
        layout_landmarks(
            &quotient.view(),
            config.curve,
            config.layout,
            stage_rng(config.seed, Stage::LandmarkLayout),
        )
    })?;
    drop(quotient);

    let skeleton = LandmarkSkeleton::new(selection, assignment, coordinates);
    let file = write_staged(staging, Role::Landmarks, |writer| {
        skeleton.write_into(writer)
    })?;

    Ok((file, evidence))
}

/// Stages the baseline coordinates: every row's assigned landmark
/// coordinate as one `f32[N, 2]` array file.
///
/// The digest streams over the finished file for the same
/// header-sealing reason as the representations'.
fn stage_baseline_coordinates<D, E>(
    staging: &StagedGeneration,
    skeleton: &MappedLandmarkSkeleton,
) -> Result<RepositoryFile, FitError<D, E>> {
    let _span = tracing::info_span!("coordinates").entered();

    {
        let mut writer = BufWriter::new(staging.create(&Role::Coordinates.file_name())?);
        place_at_landmarks(skeleton, &mut writer)?;
        writer.flush()?;
    }

    let digest = digest_file(staging.path_of(&Role::Coordinates.file_name()))?;
    Ok(Role::Coordinates.file(digest))
}

/// Streams every row's assigned landmark coordinate into one `f32[N, 2]`
/// array file.
fn place_at_landmarks(
    skeleton: &MappedLandmarkSkeleton,
    writer: impl io::Write + io::Seek,
) -> io::Result<()> {
    let coordinates = skeleton.coordinates();

    let mut writer = ArrayWriter::new(writer, ArrayVariant::F32, &[Dim::new(2)])?;
    for ordinal in skeleton.assignment() {
        writer.write_row(coordinates[ordinal.usize()].as_bytes())?;
    }
    writer.finish()?;

    Ok(())
}
