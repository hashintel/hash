//! The ingest side of one fit: everything that reads the dataset.
//!
//! [`run`] drains the dataset streams - nodes, edges, ontology, cards, and the display streams
//! beside them - into their staged artifacts
//! and resident columns and certifies the representation contract, so everything the compute side
//! needs afterwards lives in staged files and the returned [`Ingested`] value. The dataset and the
//! embedding provider are never touched again after this module returns.

use alloc::collections::BTreeSet;
use core::{borrow::Borrow, pin::pin};
use std::io::{BufWriter, Write as _};

use futures::TryStreamExt as _;
use hashql_core::id::{IdSlice, IdVec};
use smallvec::SmallVec;
use tracing::Instrument as _;
use zerocopy::IntoBytes as _;

use super::{
    FitConfig, Stage,
    error::{FitError, PriorError},
    prepare::{
        self, PrepareError,
        identity::IdentityTable,
        instance::{InstanceRecord, InstanceSpool, InstanceSpoolWriter},
        norm,
    },
    stage_rng,
};
use crate::{
    dataset::{Dataset, PROJECTOR_DIMENSIONS, TemporalAxes},
    file::{
        array::{ArrayFile, ArrayWriter, ColumnScalar as _},
        digest_file,
        generation::{Generation, ScratchDirectory, StagedGeneration},
        repository::{Artifact as _, Binding},
        salt::{
            artifact,
            metadata::{Reproducibility, Snapshot},
        },
    },
    identity::{NodeRowId, OntologyRowId},
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
    pub node_types: IdVec<NodeRowId, SmallVec<OntologyRowId, 2>>,
    /// Edges the dataset streamed.
    pub edges: u64,
    /// Distinct ontology rows the edge stream carried, ascending, forming the relation universe.
    pub relations: Vec<OntologyRowId>,
    /// Each ontology row's direct parents, in row order: the postings build's parent column.
    pub type_parents: IdVec<OntologyRowId, SmallVec<OntologyRowId, 2>>,
    /// The staged representation matrix.
    pub representations: Binding<artifact::Representations>,
    /// The staged node identity table.
    pub node_identities: Binding<artifact::NodeIdentities>,
    /// The staged edge identity table.
    pub edge_identities: Binding<artifact::EdgeIdentities>,
    /// The staged endpoint column.
    pub edge_endpoints: Binding<artifact::EdgeEndpoints>,
    /// The spooled `(edge, relation)` readings the relation stage consumes.
    pub instances: InstanceSpool,
    /// The edge multiplicity histogram, whose entry `i` counts edges carrying `i + 1` relation
    /// readings.
    pub multi_typed: Vec<u64>,
    /// The staged card-embedding artifacts.
    pub cards: CardArtifacts,
    /// The passed representation-contract spot check.
    pub norm: norm::NormSpotCheck,
}

impl Ingested {
    /// The metadata document's `snapshot` section: the corpus this ingest observed.
    pub(super) const fn snapshot(&self) -> Snapshot {
        Snapshot {
            axes: self.axes,
            nodes: self.nodes,
            edges: self.edges,
            ontology_types: self.cards.types,
        }
    }

    /// The metadata document's `reproducibility` section: the configuration and provenance the
    /// fit ran under.
    ///
    /// With [`snapshot`](Self::snapshot) it forms the paired-movement salt preimage, so the
    /// readout's draw replays from the published document's input sections alone.
    pub(super) const fn reproducibility(
        &self,
        config: FitConfig,
        prior: Option<&Generation>,
    ) -> Reproducibility {
        Reproducibility {
            config,
            embedder: self.fingerprint,
            prior: prior.map(Generation::id),
        }
    }
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

        cards,
        norm,
    })
}

/// The node drain's staged artifacts and resident columns.
struct NodeArtifacts {
    /// Nodes the stream carried.
    nodes: u64,
    /// Each node row's direct types, in row order.
    types: IdVec<NodeRowId, SmallVec<OntologyRowId, 2>>,
    /// The staged representation matrix.
    representations: Binding<artifact::Representations>,
    /// The staged node identity table.
    identities: Binding<artifact::NodeIdentities>,
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
    let mut writer = BufWriter::new(staging.create(&artifact::Representations::NAME)?);
    let columns = prepare::write_node_representations(dataset, &mut writer)
        .instrument(tracing::info_span!("stream"))
        .await
        .map_err(|error| match error {
            PrepareError::Dataset(error) => FitError::Dataset(error),
            PrepareError::Io(error) => FitError::Io(error),
        })?;
    writer.flush()?;

    let nodes = columns.ids.len();
    let auxiliary: Vec<_> = dataset
        .node_auxiliary_payload()
        .try_collect()
        .instrument(tracing::info_span!("labels"))
        .await
        .map_err(FitError::Dataset)?;
    let identities = staging.stage_with(artifact::NodeIdentities, |writer| {
        columns
            .ids
            .write_into(auxiliary.iter().map(Borrow::borrow), writer)
    })?;

    let digest = digest_file(staging.path_of(&artifact::Representations::NAME))?;

    Ok(NodeArtifacts {
        nodes,
        types: columns.types,
        representations: Binding::new(digest),
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

    let representations = ArrayFile::open(staging.path_of(&artifact::Representations::NAME))
        .map_err(|error| FitError::OpenRepresentations(error.into()))?;
    let rows: &[AlignedVecN<PROJECTOR_DIMENSIONS>] = representations
        .vectors()
        .expect("the representation matrix was sealed as f32 rows of the projector width");

    let norm = norm::spot_check(
        IdSlice::from_raw(rows),
        config.norm_check,
        stage_rng(config.seed, Stage::NormCheck),
    )
    .map_err(FitError::NormCheck)?;
    if !norm.passes() {
        return Err(FitError::RepresentationDefects(norm));
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
    identities: Binding<artifact::EdgeIdentities>,
    /// The staged endpoint column.
    endpoints: Binding<artifact::EdgeEndpoints>,
    /// The spooled `(edge, relation)` readings.
    instances: InstanceSpool,
    /// The edge multiplicity histogram, whose entry `i` counts edges carrying `i + 1` relation
    /// readings.
    multi_typed: Vec<u64>,
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
    let mut spool = InstanceSpoolWriter::create(scratch)?;

    let mut writer = BufWriter::new(staging.create(&artifact::EdgeEndpoints::NAME)?);
    let mut endpoints = ArrayWriter::new(
        &mut writer,
        <[NodeRowId; 2]>::VARIANT,
        <[NodeRowId; 2]>::TRAILING,
    )?;

    let mut stream = pin!(dataset.edges());
    while let Some(edge) = stream.try_next().await.map_err(FitError::Dataset)? {
        let row = ids.push(edge.id);
        endpoints.write_row([edge.source, edge.target].as_bytes())?;

        let confidence = RelationConfidence {
            link: edge.confidence,
            source: edge.source_confidence,
            target: edge.target_confidence,
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
            relations.insert(relation);
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

    let auxiliary: Vec<_> = dataset
        .edge_auxiliary_payload()
        .try_collect()
        .instrument(tracing::info_span!("labels"))
        .await
        .map_err(FitError::Dataset)?;
    let identities = staging.stage_with(artifact::EdgeIdentities, |writer| {
        ids.write_into(auxiliary.iter().map(Borrow::borrow), writer)
    })?;
    let digest = digest_file(staging.path_of(&artifact::EdgeEndpoints::NAME))?;
    let instances = spool.finish()?;

    Ok(EdgeArtifacts {
        edges: ids.len(),
        relations: relations.into_iter().collect(),
        identities,
        endpoints: Binding::new(digest),
        instances,
        multi_typed,
    })
}

/// Drains the ontology stream into the resident parent column.
///
/// The column is type-scale and crosses to the compute side by value: the postings build restates
/// it as the published type graph's parent regions.
async fn collect_type_parents<D, E>(
    dataset: &D,
) -> Result<IdVec<OntologyRowId, SmallVec<OntologyRowId, 2>>, FitError<D::Error, E>>
where
    D: Dataset,
{
    let mut parents = IdVec::new();
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
    pub embeddings: Binding<artifact::CardEmbeddings>,
    /// The staged text-hash column.
    pub hashes: Binding<artifact::CardHashes>,
    /// The staged ontology identity table.
    pub identities: Binding<artifact::OntologyIdentities>,
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
    let auxiliary: Vec<_> = dataset
        .ontology_auxiliary_payload()
        .try_collect()
        .instrument(tracing::info_span!("icons"))
        .await
        .map_err(FitError::Dataset)?;
    let identities = staging.stage_with(artifact::OntologyIdentities, |writer| {
        ids.write_into(auxiliary.iter().map(Borrow::borrow), writer)
    })?;

    let prior_files = prior
        .map(|generation| -> Result<_, PriorError> {
            let files = &generation.repository().files;
            let hashes = ArrayFile::open(generation.path_of(&files.card_hashes.name()))
                .map_err(PriorError::MapCards)?;
            let embeddings = ArrayFile::open(generation.path_of(&files.card_embeddings.name()))
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

    let embeddings = staging.stage_with(artifact::CardEmbeddings, |writer| {
        table.write_embeddings_into(writer)
    })?;
    let hashes = staging.stage_with(artifact::CardHashes, |writer| {
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
