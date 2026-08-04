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
use hashql_core::id::{Id as _, IdVec};
use smallvec::SmallVec;
use tracing::Instrument as _;
use zerocopy::{IntoBytes as _, LE, TryFromBytes as _, U64};

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
    dataset::{Dataset, PROJECTOR_DIMENSIONS, TemporalAxes},
    file::{
        array::{ArrayFile, ArrayVariant, ArrayWriter, Dim},
        generation::{Generation, ScratchDirectory, StagedGeneration},
        identity::Key,
        repository::RepositoryFile,
    },
    identity::OntologyRowId,
    math::AlignedVecN,
    progress::Progress,
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
    /// The embedding contract the card render ran under.
    pub fingerprint: EmbedderFingerprint,
    /// Nodes the dataset streamed.
    pub nodes: u64,
    /// Each node row's direct types, in row order: the quadtree build's type column.
    pub node_types: Vec<SmallVec<OntologyRowId, 2>>,
    /// Edges the dataset streamed.
    pub edges: u64,
    /// Distinct ontology rows the edge stream carried, ascending, forming the relation universe.
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
    /// The edge multiplicity histogram, whose entry `i` counts edges carrying `i + 1` relation
    /// readings.
    pub multi_typed: Vec<u64>,
    /// Stream confidence readings the drain clamped into `0.0..=1.0`, counted per reading.
    pub clamped_confidences: u64,
    /// The staged card-embedding artifacts.
    pub cards: CardArtifacts,
    /// The passed representation-contract spot check.
    pub norm: norm::NormSpotCheck,
}

/// Drains the dataset into the staged stream artifacts.
///
/// The stages run in the dataset's documented ingest order (nodes, edges, ontology, then the card
/// render over the same type table) and the ingest certifies the representation contract before the
/// card stream touches the embedding provider, so a defective corpus never spends provider budget.
pub(super) async fn run<D, E, P>(
    dataset: &D,
    embedder: &E,
    config: &FitConfig,
    staging: &StagedGeneration,
    scratch: &ScratchDirectory,
    prior: Option<&Generation>,
    progress: &P,
) -> Result<Ingested, FitError<D::Error, E::Error>>
where
    D: Dataset,
    E: CardEmbedder + Sync,
    P: Progress + Sync,
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
    // The generation publishes the count either way. The warning is what a running fit shows,
    // because a nonzero count means the rows this system wrote violate the contract this system
    // declares.
    if edge_artifacts.clamped_confidences > 0 {
        tracing::warn!(
            clamped = edge_artifacts.clamped_confidences,
            "clamped stream confidence readings outside the dataset contract's 0.0..=1.0"
        );
    }

    // Ontology: the parent column stays resident for the postings build, and the card stream below
    // covers the same rows.
    let type_parents = collect_type_parents(dataset)
        .instrument(tracing::info_span!("ontology"))
        .await?;
    tracing::info!(
        types = type_parents.len(),
        "collected the type parent column"
    );

    // Cards: render every card and embed the unique texts, reusing
    // the prior generation's rows where the text hash matches.
    let cards = embed_card_table(dataset, embedder, staging, prior, progress)
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
        clamped_confidences: edge_artifacts.clamped_confidences,
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
        let rows = usize::try_from(columns.ids.len()).expect("rows fit the address space");
        columns.ids.write_into(
            core::iter::repeat_n(
                <<D::NodeId as Key>::Payload>::try_ref_from_bytes(&[])
                    .expect("every payload type admits the empty byte string"),
                rows,
            ),
            writer,
        )
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
    /// Distinct ontology rows the edges carried, ascending, forming the relation universe.
    relations: Vec<OntologyRowId>,
    /// The staged edge identity table.
    identities: RepositoryFile,
    /// The staged endpoint column.
    endpoints: RepositoryFile,
    /// The spooled `(edge, relation)` readings.
    instances: InstanceSpool,
    /// The edge multiplicity histogram, whose entry `i` counts edges carrying `i + 1` relation
    /// readings.
    multi_typed: Vec<u64>,
    /// Stream confidence readings clamped into `0.0..=1.0`, counted per reading.
    clamped_confidences: u64,
}

/// Narrows a stream confidence to working precision and clamps what the dataset contract forbids.
///
/// [`Dataset`] declares every confidence to lie in `0.0..=1.0`. Nothing between the store and this
/// drain enforces that range. The readings arrive as double-precision columns and reach the force
/// algebra unchecked. A violating reading is therefore this system's own bug rather than a caller's
/// mistake. The drain clamps it instead of refusing the fit. A refusal would make one part of the
/// system punish the corpus for another part's defect while leaving that defect invisible. The
/// drain also increments `clamped` so the count travels to the generation's evidence where a
/// climbing number is the defect arriving with a witness.
///
/// `NaN` is a violation with no nearest bound. It enters as `0.0`, the reading that contributes no
/// force. A propagated `NaN` would instead poison every mass that accumulates it. No later stage
/// could then name the reading it came from.
#[expect(
    clippy::cast_possible_truncation,
    reason = "the accepted and clamped values both lie in [0, 1]; f32 is the working precision"
)]
#[inline]
fn narrow(confidence: f64, clamped: &mut u64) -> f32 {
    if (0.0..=1.0).contains(&confidence) {
        return confidence as f32;
    }

    *clamped += 1;
    if confidence.is_nan() {
        0.0
    } else {
        confidence.clamp(0.0, 1.0) as f32
    }
}

/// Drains the edge stream once.
///
/// Ids into the staged identity file, endpoints into the staged `u64[E, 2]` column, the relation
/// universe into its ascending set, and one spooled reading per `(edge, relation)` pair for the
/// relation stage.
///
/// The endpoint digest streams over the finished file because the array writer seals its header by
/// seeking. The identity writer is forward-only and digests inline.
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
    let mut clamped_confidences = 0;
    let mut spool = InstanceSpoolWriter::create(scratch)?;

    let mut writer = BufWriter::new(staging.create(&Role::EdgeEndpoints.file_name())?);
    let mut endpoints = ArrayWriter::new(&mut writer, ArrayVariant::U64Le, &[Dim::new(2)])?;

    let mut stream = pin!(dataset.edges());
    while let Some(edge) = stream.try_next().await.map_err(FitError::Dataset)? {
        let row = ids.push(edge.id);
        endpoints.write_row(
            [
                U64::<LE>::new(edge.source.as_u64()),
                U64::<LE>::new(edge.target.as_u64()),
            ]
            .as_bytes(),
        )?;

        let confidence = RelationConfidence {
            link: edge
                .confidence
                .map(|reading| narrow(reading, &mut clamped_confidences)),
            source: edge
                .source_confidence
                .map(|reading| narrow(reading, &mut clamped_confidences)),
            target: edge
                .target_confidence
                .map(|reading| narrow(reading, &mut clamped_confidences)),
        };
        // Every direct type produces its own reading at share 1/multiplicity: a multi-typed link is
        // a mixture of its relation domains' opinions, one link's worth of force in total.
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
            relations.insert(relation.as_u64());
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
        let rows = usize::try_from(ids.len()).expect("rows fit the address space");
        ids.write_into(
            core::iter::repeat_n(
                <<D::EdgeId as Key>::Payload>::try_ref_from_bytes(&[])
                    .expect("every payload type admits the empty byte string"),
                rows,
            ),
            writer,
        )
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
        clamped_confidences,
    })
}

/// Drains the ontology stream into the resident parent column.
///
/// The column is type-scale and crosses to the compute side by value: the postings build restates
/// it as the published type graph's parent regions.
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
    /// How the embedding pass obtained the rows, recorded as metadata evidence.
    pub stats: CardEmbeddingStats,
}

/// Renders every card and stages the card-embedding columns from the embedded unique texts.
///
/// Both columns land beside the ontology identity table collected from the same stream.
///
/// A prior generation's card files map back as the reuse table: texts whose hash the reuse table
/// lists keep their rows without touching the provider. Reuse is fingerprint-guarded inside
/// [`embed_cards`], so a changed embedding contract re-embeds everything.
async fn embed_card_table<D, E, P>(
    dataset: &D,
    embedder: &E,
    staging: &StagedGeneration,
    prior: Option<&Generation>,
    progress: &P,
) -> Result<CardArtifacts, FitError<D::Error, E::Error>>
where
    D: Dataset,
    E: CardEmbedder + Sync,
    P: Progress + Sync,
{
    let (cards, ids) = async {
        let mut stream = pin!(dataset.render_cards());
        let mut cards = IdVec::new();
        let mut ids = IdentityTable::<OntologyRowId, _>::new();
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
        let rows = usize::try_from(ids.len()).expect("rows fit the address space");
        ids.write_into(
            core::iter::repeat_n(
                <<D::OntologyId as Key>::Payload>::try_ref_from_bytes(&[])
                    .expect("every payload type admits the empty byte string"),
                rows,
            ),
            writer,
        )
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
                    embeddings.vectors().ok_or(PriorError::MalformedCards)?,
                )
                .ok_or(PriorError::MalformedCards)
            },
        )
        .transpose()?;

    let (table, stats) = embed_cards(embedder, &cards, prior_view, progress)
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
