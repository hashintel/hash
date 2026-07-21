//! The ingest side of one fit: everything that reads the dataset.
//!
//! [`run`] drains the dataset streams - nodes, edges, ontology, cards - into their staged artifacts
//! and resident columns and certifies the representation contract, so everything the compute side
//! needs afterwards lives in staged files and the returned [`Ingested`] value. The dataset and the
//! embedding provider are never touched again after this module returns.

use alloc::collections::BTreeSet;
use core::pin::pin;
use std::io::{BufWriter, Write as _};

use futures::TryStreamExt as _;
use smallvec::SmallVec;
use tracing::Instrument as _;
use zerocopy::{IntoBytes as _, LE, U64};

use super::{
    FitConfig, Stage,
    error::{FitError, PriorError, StageError},
    prepare::{
        self, PrepareError,
        identity::IdentityTable,
        instance::{InstanceRecord, InstanceSpool, InstanceSpoolWriter},
        norm,
    },
    role::{Role, digest_file, write_staged},
    stage_rng,
};
use crate::{
    dataset::{Dataset, EdgeRowId, OntologyRowId, PROJECTOR_DIMENSIONS, TemporalAxes},
    file::{
        WriteInto as _,
        array::{ArrayFile, ArrayVariant, ArrayWriter, Dim},
        generation::{Generation, ScratchDirectory, StagedGeneration},
        repository::RepositoryFile,
    },
    math::AlignedVecN,
    salt::{
        embedding::{
            CardEmbedder, CardEmbeddingStats, CardEmbeddingView, EmbedderFingerprint, embed_cards,
        },
        relation::RelationConfidence,
    },
};
/// Everything one fit's ingest produced.
///
/// The staged stream artifacts, the snapshot the metadata records, and the passed admission
/// evidence.
pub(super) struct Ingested {
    /// The bitemporal point the dataset observed.
    pub axes: Option<TemporalAxes>,
    /// The embedding contract the card table was produced under.
    pub fingerprint: EmbedderFingerprint,
    /// Nodes the dataset streamed.
    pub nodes: u64,
    /// Each node row's direct types, in row order: the quadtree build's type column.
    pub node_types: Vec<SmallVec<OntologyRowId, 2>>,
    /// Edges the dataset streamed.
    pub edges: u64,
    /// The relation universe: distinct ontology rows the edge stream carried, ascending.
    pub relations: Vec<OntologyRowId>,
    /// Each ontology row's direct parents, in row order: the postings build's parent column.
    pub type_parents: Vec<SmallVec<OntologyRowId, 2>>,
    /// The staged representation matrix.
    pub representations: RepositoryFile,
    /// The staged node identity table.
    pub node_identities: RepositoryFile,
    /// The staged edge identity table.
    pub edge_identities: RepositoryFile,
    /// The staged endpoint column.
    pub edge_endpoints: RepositoryFile,
    /// The spooled `(edge, relation)` readings the relation stage consumes.
    pub instances: InstanceSpool,
    /// The edge multiplicity histogram: entry `i` counts edges carrying `i + 1` relation readings.
    pub multi_typed: Vec<u64>,
    /// The staged card-embedding artifacts.
    pub cards: CardArtifacts,
    /// The passed representation-contract spot check.
    pub norm: norm::NormSpotCheck,
}

/// Drains the dataset into the staged stream artifacts.
///
/// The stages run in the dataset's documented ingest order - nodes, edges, ontology, then the card
/// render over the same type table - and the representation contract is certified before the card
/// stream touches the embedding provider, so a defective corpus never spends provider budget.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
pub(super) async fn run<D, E>(
    dataset: &D,
    embedder: &E,
    config: &FitConfig,
    staging: &StagedGeneration,
    scratch: &ScratchDirectory,
    prior: Option<&Generation>,
) -> Result<Ingested, FitError<D::Error, E::Error>>
where
    D: Dataset,
    E: CardEmbedder + Sync,
{
    // Nodes: stream every representation into the staged matrix beside
    // its identity table and type column, map the matrix back, and
    // certify the source contract on the mapped rows.
    let node_artifacts = stage_representations(dataset, staging)
        .instrument(tracing::info_span!("representations"))
        .await?;
    tracing::info!(
        nodes = node_artifacts.nodes,
        "staged the node representations and identities"
    );

    let norm = certify_representations(staging, config)?;

    // Edges: one drain fills the identity column, the endpoint column,
    // the relation universe, and the instance spool the relation stage
    // consumes once the policy table resolves.
    let edge_artifacts = stage_edges(dataset, staging, scratch)
        .instrument(tracing::info_span!("edges"))
        .await?;
    tracing::info!(
        edges = edge_artifacts.edges,
        instances = edge_artifacts.instances.count(),
        "staged the edge identities, endpoints, and instance spool"
    );

    // Ontology: the parent column stays resident for the postings
    // build; the card stream below covers the same rows.
    let type_parents = collect_type_parents(dataset)
        .instrument(tracing::info_span!("ontology"))
        .await?;
    tracing::info!(
        types = type_parents.len(),
        "collected the type parent column"
    );

    // Cards: render every card and embed the unique texts, reusing
    // the prior generation's rows where the text hash matches.
    let cards = embed_card_table(dataset, embedder, staging, prior)
        .instrument(tracing::info_span!("cards"))
        .await?;
    tracing::info!(
        types = cards.types,
        reused = cards.stats.reused,
        embedded = cards.stats.embedded,
        "staged the card-embedding table"
    );

    Ok(Ingested {
        axes: dataset.axes(),
        fingerprint: embedder.fingerprint(),
        nodes: node_artifacts.nodes,
        node_types: node_artifacts.types,
        edges: edge_artifacts.edges,
        relations: edge_artifacts.relations,
        type_parents,
        representations: node_artifacts.representations,
        node_identities: node_artifacts.identities,
        edge_identities: edge_artifacts.identities,
        edge_endpoints: edge_artifacts.endpoints,
        instances: edge_artifacts.instances,
        multi_typed: edge_artifacts.multi_typed,
        cards,
        norm,
    })
}

/// The node drain's staged artifacts and resident columns.
struct NodeArtifacts {
    /// Nodes the stream carried.
    nodes: u64,
    /// Each node row's direct types, in row order.
    types: Vec<SmallVec<OntologyRowId, 2>>,
    /// The staged representation matrix.
    representations: RepositoryFile,
    /// The staged node identity table.
    identities: RepositoryFile,
}

/// Streams every node's representation and ids into their staged files.
///
/// The representations fill the staged `f32[N, 512]` matrix and the ids the staged identity file;
/// the type column stays resident for the quadtree build.
///
/// The matrix digest streams over the finished file because the writer seals its header by seeking;
/// the identity writer is forward-only and digests inline.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
async fn stage_representations<D, E>(
    dataset: &D,
    staging: &StagedGeneration,
) -> Result<NodeArtifacts, FitError<D::Error, E>>
where
    D: Dataset,
{
    let mut writer = BufWriter::new(staging.create(&Role::Representations.file_name())?);
    let columns = prepare::write_node_representations(dataset, &mut writer)
        .instrument(tracing::info_span!("stream"))
        .await
        .map_err(|error| match error {
            PrepareError::Dataset(error) => FitError::Dataset(error),
            PrepareError::Io(error) => FitError::Io(error),
        })?;
    writer.flush()?;

    let nodes = columns.ids.len();
    let identities = write_staged(staging, Role::NodeIdentities, |writer| {
        columns.ids.write_into(writer)
    })?;

    let digest = digest_file(staging.path_of(&Role::Representations.file_name()))?;

    Ok(NodeArtifacts {
        nodes,
        types: columns.types,
        representations: Role::Representations.file(digest),
        identities,
    })
}

/// Certifies the source contract on the freshly staged representation rows.
///
/// Returns the passing evidence.
fn certify_representations<D, E>(
    staging: &StagedGeneration,
    config: &FitConfig,
) -> Result<norm::NormSpotCheck, FitError<D, E>> {
    let _span = tracing::info_span!("norm-check").entered();

    let representations = ArrayFile::open(staging.path_of(&Role::Representations.file_name()))
        .map_err(|error| FitError::Stage(StageError::MapRepresentations(error)))?;
    let rows: &[AlignedVecN<PROJECTOR_DIMENSIONS>] = representations
        .vectors()
        .expect("the representation matrix was sealed as f32 rows of the projector width");

    let norm = norm::spot_check(
        rows,
        config.norm_check,
        stage_rng(config.seed, Stage::NormCheck),
    )
    .map_err(StageError::NormCheck)?;
    if !norm.passes() {
        return Err(StageError::RepresentationDefects(norm).into());
    }
    tracing::info!(
        sampled = norm.sampled_rows,
        "the representations passed the norm spot check"
    );

    Ok(norm)
}

/// The edge drain's staged artifacts and spooled readings.
struct EdgeArtifacts {
    /// Edges the stream carried.
    edges: u64,
    /// The relation universe: distinct ontology rows the edges carried, ascending.
    relations: Vec<OntologyRowId>,
    /// The staged edge identity table.
    identities: RepositoryFile,
    /// The staged endpoint column.
    endpoints: RepositoryFile,
    /// The spooled `(edge, relation)` readings.
    instances: InstanceSpool,
    /// The edge multiplicity histogram: entry `i` counts edges carrying `i + 1` relation readings.
    multi_typed: Vec<u64>,
}

/// Narrows a stream confidence to working precision.
#[expect(
    clippy::cast_possible_truncation,
    reason = "confidences lie in [0, 1] by the dataset contract; f32 is the working precision"
)]
#[inline]
const fn narrow(confidence: f64) -> f32 {
    confidence as f32
}

/// Drains the edge stream once.
///
/// Ids into the staged identity file, endpoints into the staged `u64[E, 2]` column, the relation
/// universe into its ascending set, and one spooled reading per `(edge, relation)` pair for the
/// relation stage.
///
/// The endpoint digest streams over the finished file because the array writer seals its header by
/// seeking; the identity writer is forward-only and digests inline.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
async fn stage_edges<D, E>(
    dataset: &D,
    staging: &StagedGeneration,
    scratch: &ScratchDirectory,
) -> Result<EdgeArtifacts, FitError<D::Error, E>>
where
    D: Dataset,
{
    let mut ids = IdentityTable::new();
    let mut relations = BTreeSet::new();
    let mut multi_typed: Vec<u64> = Vec::new();
    let mut spool = InstanceSpoolWriter::create(scratch)?;

    let mut writer = BufWriter::new(staging.create(&Role::EdgeEndpoints.file_name())?);
    let mut endpoints = ArrayWriter::new(&mut writer, ArrayVariant::U64, &[Dim::new(2)])?;

    let mut stream = pin!(dataset.edges());
    while let Some(edge) = stream.try_next().await.map_err(FitError::Dataset)? {
        let row = EdgeRowId::new(ids.len());
        ids.push(edge.id);
        endpoints.write_row(
            [
                U64::<LE>::new(edge.source.get()),
                U64::<LE>::new(edge.target.get()),
            ]
            .as_bytes(),
        )?;

        let confidence = RelationConfidence {
            link: edge.confidence.map(narrow),
            source: edge.source_confidence.map(narrow),
            target: edge.target_confidence.map(narrow),
        };
        // Every direct type reads separately at share 1/multiplicity:
        // a multi-typed link is a mixture of its relation domains'
        // opinions, one link's worth of force in total. The M0 rule
        // that selected exactly one domain per link by canonical-URL
        // order retired 2026-07-20 with the versioned-URL identity
        // work.
        let multiplicity = u32::try_from(edge.ontology.len())
            .expect("an edge's deduplicated direct types are far below u32");
        if multiplicity > 0 {
            let slot = edge.ontology.len() - 1;
            if multi_typed.len() <= slot {
                multi_typed.resize(slot + 1, 0);
            }
            multi_typed[slot] += 1;
        }
        for &relation in &edge.ontology {
            relations.insert(relation.get());
            spool.push(InstanceRecord::new(
                row,
                relation,
                edge.source,
                edge.target,
                confidence,
                multiplicity,
            ))?;
        }
    }
    endpoints.finish()?;
    writer.flush()?;

    let identities = write_staged(staging, Role::EdgeIdentities, |writer| {
        ids.write_into(writer)
    })?;
    let digest = digest_file(staging.path_of(&Role::EdgeEndpoints.file_name()))?;
    let instances = spool.finish()?;

    Ok(EdgeArtifacts {
        edges: ids.len(),
        relations: relations.into_iter().map(OntologyRowId::new).collect(),
        identities,
        endpoints: Role::EdgeEndpoints.file(digest),
        instances,
        multi_typed,
    })
}

/// Drains the ontology stream into the resident parent column.
///
/// The column is type-scale and crosses to the compute side by value: the postings build restates
/// it as the published type graph's parent regions.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
async fn collect_type_parents<D, E>(
    dataset: &D,
) -> Result<Vec<SmallVec<OntologyRowId, 2>>, FitError<D::Error, E>>
where
    D: Dataset,
{
    let mut parents = Vec::new();
    let mut stream = pin!(dataset.ontology());
    while let Some(entry) = stream.try_next().await.map_err(FitError::Dataset)? {
        parents.push(entry.parents);
    }

    Ok(parents)
}

/// The staged card-embedding artifacts of one fit.
pub(super) struct CardArtifacts {
    /// Ontology types embedded: the row count of the staged files.
    pub types: u64,
    /// The staged embedding matrix.
    pub embeddings: RepositoryFile,
    /// The staged text-hash column.
    pub hashes: RepositoryFile,
    /// The staged ontology identity table.
    pub identities: RepositoryFile,
    /// How the rows were obtained; metadata evidence.
    pub stats: CardEmbeddingStats,
}

/// Renders every card, embeds the unique texts, and stages the card-embedding columns.
///
/// Both columns land beside the ontology identity table collected from the same stream.
///
/// A prior generation's card files map back as the reuse table: texts whose hash appears there keep
/// their rows without touching the provider. Reuse is fingerprint-guarded inside [`embed_cards`],
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
    let (cards, ids) = async {
        let mut stream = pin!(dataset.render_cards());
        let mut cards = Vec::new();
        let mut ids = IdentityTable::new();
        while let Some((id, card)) = stream.try_next().await.map_err(FitError::Cards)? {
            ids.push(id);
            cards.push(card);
        }
        Ok::<_, FitError<D::Error, E::Error>>((cards, ids))
    }
    .instrument(tracing::info_span!("render-cards"))
    .await?;

    let types = cards.len() as u64;
    let identities = write_staged(staging, Role::OntologyIdentities, |writer| {
        ids.write_into(writer)
    })?;

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
        identities,
        stats,
    })
}
