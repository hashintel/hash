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

use core::{num::NonZero, pin::pin};
use std::{
    fs::File,
    io::{self, BufWriter, Write as _},
};

use camino::Utf8Path;
use futures::TryStreamExt as _;
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;
use zerocopy::IntoBytes as _;

use self::prepare::{PrepareError, norm};
pub(crate) use self::{echo::FitConfigDef, error::FitError};
use crate::{
    dataset::{Dataset, NodeRowId, PROJECTOR_DIMENSIONS},
    file::{
        array::{ArrayFile, ArrayVariant, ArrayWriter, Dim},
        generation::{GenerationRoot, PublishedGeneration, ScratchDirectory, StagedGeneration},
        landmark::read::LandmarkFile,
        repository::{FileName, RepositoryFile, RepositoryVersion},
        salt::{
            SaltFiles, SaltRepository,
            metadata::{
                Evidence, LandmarkEvidence, Placement, Reproducibility, SaltMetadata, Snapshot,
            },
        },
        sprs::read::SprsFile,
    },
    integrity::{Sha256, Sha256Digest, Update as _, Writer},
    math::{AffinityCurve, AlignedVecN},
    salt::{
        embedding::{CardEmbedder, CardEmbeddingStats, embed_cards},
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
        semantic::{SemanticGraph, SmoothingOptions, artifact::MappedSemanticGraph},
    },
};

mod echo;
mod error;
pub(crate) mod prepare;

#[cfg(test)]
mod tests;

/// Every setting of one fit, valid by construction.
///
/// Stage options keep their own documented defaults; the fields without
/// defaults are the choices no fit can imply: the seed, the landmark
/// capacity, and the low-dimensional kernel.
#[derive(Debug, Copy, Clone, PartialEq)]
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
    Coordinates,
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
            Self::Coordinates => FileName::pinned("coordinates.arr"),
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
const _: [FileName; 7] = [
    Role::Representations.file_name(),
    Role::CardEmbeddings.file_name(),
    Role::CardHashes.file_name(),
    Role::Knn.file_name(),
    Role::Semantic.file_name(),
    Role::Landmarks.file_name(),
    Role::Coordinates.file_name(),
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
    let mut writer = Writer {
        accumulator: Sha256::new(),
        writer: io::sink(),
    };
    io::copy(&mut File::open(path.as_ref())?, &mut writer)?;

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
/// # Errors
///
/// Returns an error when the dataset or embedding provider fails, a
/// stage rejects its input, an admission check fails
/// ([`FitError::RepresentationDefects`],
/// [`FitError::RecallBelowMinimum`]), or a write, map, or publish step
/// fails. Nothing is published on any error.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
pub(crate) async fn fit<D, E>(
    dataset: &D,
    embedder: &E,
    config: &FitConfig,
    root: &GenerationRoot,
) -> Result<PublishedGeneration, FitError<D::Error, E::Error>>
where
    D: Dataset,
    E: CardEmbedder + Sync,
{
    let staging = root.stage()?;
    let scratch = root.scratch()?;

    // Nodes: stream every representation into the staged matrix, map it
    // back, and certify the source contract on the mapped rows.
    let (nodes, representations_file) = stage_representations(dataset, &staging).await?;
    tracing::info!(nodes, "staged the node representations");

    let representations = ArrayFile::open(staging.path_of(&Role::Representations.file_name()))
        .map_err(FitError::MapRepresentations)?;
    let rows: &[AlignedVecN<PROJECTOR_DIMENSIONS>] = representations
        .vectors()
        .expect("the representation matrix was sealed as f32 rows of the projector width");

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

    // Edges: only the snapshot count is consumed. The relation build
    // (`RelationIndexes::build`) wants these rows as instances, but its
    // policy table has no producer yet.
    // TODO: assemble `RelationInstance`s from this stream and wire the
    //       relation stage once the classifier and policy artifacts have
    //       writers.
    let edges = {
        let mut stream = pin!(dataset.edges());
        let mut count = 0_u64;
        while (stream.try_next().await.map_err(FitError::Dataset)?).is_some() {
            count += 1;
        }
        count
    };

    // Ontology: render every card and embed the unique texts.
    let cards = embed_card_table(dataset, embedder, &staging).await?;
    tracing::info!(
        types = cards.types,
        reused = cards.stats.reused,
        embedded = cards.stats.embedded,
        "staged the card-embedding table"
    );

    // Neighbours: build the search backend, admit it by exact recall,
    // and derive the persisted table from it.
    let (recall, knn_file) = build_neighbour_table(&staging, &scratch, config, rows)?;
    let knn = MappedKnn::new(SprsFile::open(staging.path_of(&Role::Knn.file_name()))?)
        .map_err(FitError::InvalidKnn)?;
    tracing::info!(recall = recall.recall(), "staged the admitted k-NN table");

    // Semantic graph: smooth the mapped table into fuzzy memberships.
    let semantic_file = {
        let graph = SemanticGraph::build(&knn.view(), config.smoothing);
        write_staged(&staging, Role::Semantic, |writer| graph.write_into(writer))?
    };
    let semantic = MappedSemanticGraph::new(SprsFile::open(
        staging.path_of(&Role::Semantic.file_name()),
    )?)
    .map_err(FitError::InvalidSemantic)?;
    tracing::info!("staged the semantic graph");

    // Landmarks: select, assign, contract, and lay out the skeleton.
    let (landmarks_file, landmark_evidence) =
        build_landmark_skeleton(&staging, &scratch, config, rows, &semantic)?;
    let skeleton = MappedLandmarkSkeleton::new(LandmarkFile::open(
        staging.path_of(&Role::Landmarks.file_name()),
    )?)
    .map_err(FitError::InvalidLandmarks)?;
    tracing::info!(
        selected = landmark_evidence.selected,
        "staged the landmark skeleton"
    );

    // Placement baseline: every row takes its assigned landmark's layout
    // coordinate. The coordinate digest streams over the finished file
    // for the same header-sealing reason as the representations'.
    // TODO: the trained projector replaces this placer at the same
    //       artifact seam; the metadata's `Placement` records which one
    //       ran.
    {
        let mut writer = BufWriter::new(staging.create(&Role::Coordinates.file_name())?);
        place_at_landmarks(&skeleton, &mut writer)?;
        writer.flush()?;
    }
    let coordinates_digest = digest_file(staging.path_of(&Role::Coordinates.file_name()))?;
    tracing::info!("staged the baseline coordinates");

    // TODO: attraction, protection, classifier, and policy roles join
    //       `SaltFiles` when their stages' artifact writers land.
    let repository = SaltRepository {
        version: RepositoryVersion::V0,
        files: SaltFiles {
            representations: representations_file,
            card_embeddings: cards.embeddings,
            card_hashes: cards.hashes,
            knn: knn_file,
            semantic: semantic_file,
            landmarks: landmarks_file,
            coordinates: Role::Coordinates.file(coordinates_digest),
        },
        metadata: SaltMetadata {
            snapshot: Snapshot {
                axes: dataset.axes(),
                nodes,
                edges,
                ontology_types: cards.types,
            },
            reproducibility: Reproducibility {
                config: *config,
                embedder: embedder.fingerprint(),
            },
            placement: Placement::LandmarkBaseline,
            evidence: Evidence {
                cards: cards.stats,
                norm,
                recall,
                landmarks: landmark_evidence,
            },
        },
    };

    staging.seal(&repository).map_err(FitError::Seal)
}

/// Streams every node's representation into the staged `f32[N, 512]`
/// matrix, returning the row count with the staged file.
///
/// The matrix digest streams over the finished file because the writer
/// seals its header by seeking.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
async fn stage_representations<D, E>(
    dataset: &D,
    staging: &StagedGeneration,
) -> Result<(u64, RepositoryFile), FitError<D::Error, E>>
where
    D: Dataset,
{
    let mut writer = BufWriter::new(staging.create(&Role::Representations.file_name())?);
    let nodes = prepare::write_node_representations(dataset, &mut writer)
        .await
        .map_err(|error| match error {
            PrepareError::Dataset(error) => FitError::Dataset(error),
            PrepareError::Io(error) => FitError::Io(error),
        })?;
    writer.flush()?;

    let digest = digest_file(staging.path_of(&Role::Representations.file_name()))?;

    Ok((nodes, Role::Representations.file(digest)))
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
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
async fn embed_card_table<D, E>(
    dataset: &D,
    embedder: &E,
    staging: &StagedGeneration,
) -> Result<CardArtifacts, FitError<D::Error, E::Error>>
where
    D: Dataset,
    E: CardEmbedder + Sync,
{
    let cards = {
        let mut stream = pin!(dataset.render_cards());
        let mut cards = Vec::new();
        while let Some((_, card)) = stream.try_next().await.map_err(FitError::Cards)? {
            cards.push(card);
        }
        cards
    };

    let types = cards.len() as u64;

    // TODO: pass the previous generation's mapped table as `prior` so
    //       unchanged card texts reuse their embeddings across
    //       generations.
    let (table, stats) = embed_cards(embedder, &cards, None)
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

/// Builds the search backend over the mapped representations, admits it
/// by exact recall, and stages the derived k-NN table.
fn build_neighbour_table<D, E>(
    staging: &StagedGeneration,
    scratch: &ScratchDirectory,
    config: &FitConfig,
    rows: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
) -> Result<(recall::RecallSpotCheck, RepositoryFile), FitError<D, E>> {
    let mut index = HannoyIndex::new(scratch.directory("knn")?, config.index)?;
    index.insert_many(rows.iter().enumerate().map(|(row, components)| Embedding {
        id: NodeRowId::new(row as u64),
        components,
    }))?;
    index.build(stage_rng(config.seed, Stage::KnnLink))?;

    let recall = recall::spot_check(
        &index,
        rows,
        config.recall_check,
        stage_rng(config.seed, Stage::RecallCheck),
    )
    .map_err(FitError::RecallCheck)?;
    if !recall.meets_minimum() {
        return Err(FitError::RecallBelowMinimum(recall));
    }

    let table = Knn::build(&index, rows.len(), config.neighbours).map_err(FitError::Knn)?;
    let file = write_staged(staging, Role::Knn, |writer| table.write_into(writer))?;

    Ok((recall, file))
}

/// Selects, assigns, contracts, and lays out the landmark skeleton,
/// staging it as one combined file.
///
/// Candidates are uniform over the corpus.
// TODO: candidates take stratification axes and subgroup minimums once
//       a stage computes them, and `prior_landmark` marks once fit
//       consumes the previous generation's skeleton.
fn build_landmark_skeleton<D, E>(
    staging: &StagedGeneration,
    scratch: &ScratchDirectory,
    config: &FitConfig,
    rows: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    semantic: &MappedSemanticGraph,
) -> Result<(RepositoryFile, LandmarkEvidence), FitError<D, E>> {
    let selection = {
        let candidates: Vec<LandmarkCandidate> = (0..rows.len())
            .map(|row| LandmarkCandidate {
                row: NodeRowId::new(row as u64),
                sampling_weight: SamplingWeight::UNIFORM,
                axes: SubgroupAxes::default(),
                prior_landmark: false,
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
        let mut index = HannoyIndex::new(scratch.directory("assignment")?, config.index)?;
        assign_landmarks(
            &mut index,
            stage_rng(config.seed, Stage::LandmarkAssignment),
            rows,
            &selection,
        )?
    };

    let quotient = quotient_graph(&semantic.view(), &assignment, config.quotient)?;
    let coordinates = layout_landmarks(
        &quotient.view(),
        config.curve,
        config.layout,
        stage_rng(config.seed, Stage::LandmarkLayout),
    )?;
    drop(quotient);

    let skeleton = LandmarkSkeleton::new(selection, assignment, coordinates);
    let file = write_staged(staging, Role::Landmarks, |writer| {
        skeleton.write_into(writer)
    })?;

    Ok((file, evidence))
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
