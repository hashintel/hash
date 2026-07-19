//! The ingest side of one fit: everything that reads the dataset.
//!
//! [`run`] drains the three dataset streams - nodes, edges, ontology -
//! into their staged artifacts and certifies the representation
//! contract, so everything the compute side needs afterwards lives in
//! staged files and the returned [`Ingested`] value. The dataset and
//! the embedding provider are never touched again after this module
//! returns.

use alloc::collections::BTreeSet;
use core::pin::pin;
use std::io::{BufWriter, Write as _};

use futures::TryStreamExt as _;
use tracing::Instrument as _;

use super::{
    FitConfig, Stage,
    error::{FitError, PriorError, StageError},
    prepare::{self, PrepareError, identity::IdentityTable, norm},
    role::{Role, digest_file, write_staged},
    stage_rng,
};
use crate::{
    dataset::{Dataset, OntologyRowId, PROJECTOR_DIMENSIONS, TemporalAxes},
    file::{
        array::ArrayFile,
        generation::{Generation, StagedGeneration},
        repository::RepositoryFile,
    },
    math::AlignedVecN,
    salt::embedding::{
        CardEmbedder, CardEmbeddingStats, CardEmbeddingView, EmbedderFingerprint, embed_cards,
    },
};
/// Everything one fit's ingest produced: the staged stream artifacts,
/// the snapshot the metadata records, and the passed admission
/// evidence.
pub(super) struct Ingested {
    /// The bitemporal point the dataset observed.
    pub axes: Option<TemporalAxes>,
    /// The embedding contract the card table was produced under.
    pub fingerprint: EmbedderFingerprint,
    /// Nodes the dataset streamed.
    pub nodes: u64,
    /// Edges the dataset streamed.
    pub edges: u64,
    /// The relation universe: distinct ontology rows the edge stream
    /// carried, ascending.
    pub relations: Vec<OntologyRowId>,
    /// The staged representation matrix.
    pub representations: RepositoryFile,
    /// The staged node identity table.
    pub node_identities: RepositoryFile,
    /// The staged edge identity table.
    pub edge_identities: RepositoryFile,
    /// The staged card-embedding artifacts.
    pub cards: CardArtifacts,
    /// The passed representation-contract spot check.
    pub norm: norm::NormSpotCheck,
}

/// Drains the dataset into the staged stream artifacts.
///
/// The stages run in the dataset's documented ingest order - nodes,
/// edges, ontology - and the representation contract is certified
/// before the card stream touches the embedding provider, so a
/// defective corpus never spends provider budget.
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
    prior: Option<&Generation>,
) -> Result<Ingested, FitError<D::Error, E::Error>>
where
    D: Dataset,
    E: CardEmbedder + Sync,
{
    // Nodes: stream every representation into the staged matrix beside
    // its identity table, map the matrix back, and certify the source
    // contract on the mapped rows.
    let (nodes, representations, node_identities) = stage_representations(dataset, staging)
        .instrument(tracing::info_span!("representations"))
        .await?;
    tracing::info!(nodes, "staged the node representations and identities");

    let norm = certify_representations(staging, config)?;

    // Edges: the identity column and the relation universe are drained;
    // the endpoint columns, the adjacency the serving contract wants,
    // and the relation stage rework land together.
    // TODO: persist the endpoint columns and the incident-edge
    //       adjacency, and assemble `RelationInstance`s from this
    //       stream against the staged policy table (the attraction
    //       writer already landed).
    let (edges, relations, edge_identities) = stage_edge_identities(dataset, staging)
        .instrument(tracing::info_span!("edge-identities"))
        .await?;
    tracing::info!(edges, "staged the edge identities");

    // Ontology: render every card and embed the unique texts, reusing
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
        nodes,
        edges,
        relations,
        representations,
        node_identities,
        edge_identities,
        cards,
        norm,
    })
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

/// Certifies the source contract on the freshly staged representation
/// rows, returning the passing evidence.
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

/// The staged card-embedding artifacts of one fit.
pub(super) struct CardArtifacts {
    /// Ontology types embedded: the row count of both staged files.
    pub types: u64,
    /// The staged embedding matrix.
    pub embeddings: RepositoryFile,
    /// The staged text-hash column.
    pub hashes: RepositoryFile,
    /// How the rows were obtained; metadata evidence.
    pub stats: CardEmbeddingStats,
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
