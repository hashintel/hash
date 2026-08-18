//! The fixed SQL statements and the shared material they agree on.
//!
//! This module owns the corpus definition, the fragment builder kit, and the archived-identity
//! vocabulary, together with the statements themselves and the decoders that read their rows.
//! Every statement runs under the frozen-snapshot regime or the serving-time regime, and its
//! doc names which:
//!
//! - **Frozen-snapshot statements** execute on the one repeatable-read transaction a
//!   [`PostgresDataset`](crate::dataset::postgres::PostgresDataset) opens, so every answer
//!   describes the same committed state as every other, however many queries a fit issues.
//! - **Serving-time statements** - the lookups this module executes itself, below - run on a
//!   caller-supplied connection at axes taken at the call, so every answer describes the store as
//!   it stands rather than as any fit observed it.
//!
//! # The statement discipline
//!
//! Every statement is a value of the store's statement AST
//! ([`SelectStatement`](hash_graph_postgres_store::store::postgres::query::SelectStatement)),
//! composed from shared fragments and rendered to SQL once when it leaves the builder. The
//! cross-boundary agreements travel as structure:
//!
//! - The shared fragments - [`corpus::scope`], [`corpus::links`], the type-ordinal mapping - are
//!   themselves statement values, so a statement composes them by attaching them to its WITH clause
//!   instead of splicing rendered text, and a fragment's shape is one declaration however many
//!   statements share it.
//! - Schema tables and columns come from the store's own vocabulary
//!   ([`Table`](hash_graph_postgres_store::store::postgres::query::Table) and its column enums), so
//!   a rename upstream fails compilation here instead of failing at query time.
//! - The corpus's own virtual tables carry the same discipline through [`vocabulary`]: the fragment
//!   that creates a table aliases its outputs through the enum its consumers cite.
//! - Parameters exist only as parameter expressions returned by a bind
//!   ([`Binder`](hash_graph_postgres_store::store::postgres::query::Binder)), so a statement cannot
//!   cite a parameter its bind list does not carry and the indices cannot drift from the values.
//! - Output columns exist only as indices returned by the select list
//!   ([`SelectList`](hash_graph_postgres_store::store::postgres::query::SelectList)), which also
//!   builds the select clause, so the decoder reads exactly the positions the statement selected.
//! - The link-attachment discriminants bind as the store's own enums, type-checked on the wire,
//!   rather than as quoted literals.
//! - Names whose agreement never leaves one statement - a join alias such as `meta`, a CTE chain's
//!   stage-local columns - live as named constants beside the statement that introduces them
//!   ([`Aliased`](hash_graph_postgres_store::store::postgres::query::Aliased)), so every mention
//!   moves in one edit.
//!
//! The store's `SelectCompiler` stays out of this module: the compiler translates a
//! caller-supplied filter into a statement at runtime, as in the serving side's visibility
//! proofs. Everything here is a fixed statement composed from shared fragments, and the AST
//! expresses such a statement directly.
//!
//! # Module map
//!
//! The shared material, which every statement family builds on:
//!
//! - [`corpus`] defines the node and link universes and bootstraps the type table.
//! - [`vocabulary`] names the corpus's virtual tables and their columns.
//! - [`sql`] holds the fragment kit, from the currency conditions to the ordinal mapping.
//! - [`requests`] binds caller identities as the statements' request table.
//! - [`vector`] owns the pgvector boundary, expression and decoder both.
//! - [`id`] holds the archived-identity vocabulary the decoders answer in.
//!
//! The statement families, where a family whose builder is a separate function pins its
//! rendered SQL with a snapshot test in the same file and [`ontology`]'s queries build and
//! execute in one motion instead:
//!
//! - [`classification`] decides node-versus-link for requested identities.
//! - [`edition_display`] reads display payloads keyed by immutable edition.
//! - [`embeddings`] reads stored embeddings at canonical or projector width.
//! - [`legends`] streams display legends positioned against the corpus.
//! - [`node_types`] reads direct types as type-table ordinals.
//! - [`ontology`] reads supertype lists and inherited icons over the type table.
//! - [`card`] gathers the store facts behind card rendering.
//!
//! In a builder's `# SQL` section, `<name>` stands for a bound parameter or an attached stage's
//! body, and a membership condition reads `IN (...)` where the AST renders `= ANY(...)`: the
//! section sketches the statement's shape, and the snapshot pins the exact text.
//!
//! The functions below are the serving-time lookups this module executes itself.

#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

pub(crate) mod card;
pub(crate) mod classification;
pub(crate) mod corpus;
pub(crate) mod edition_display;
pub(crate) mod embeddings;
pub(crate) mod id;
pub(crate) mod legends;
pub(crate) mod node_types;
pub(crate) mod ontology;
pub(crate) mod requests;
pub(crate) mod sql;
pub(crate) mod vector;
pub(crate) mod vocabulary;

use hash_graph_postgres_store::store::AsClient;
use tokio_postgres::GenericClient as _;
use type_system::knowledge::entity::id::EntityEditionId;
use uuid::Uuid;

pub(crate) use self::{card::CardParameters, classification::Classification};
use self::{edition_display::DisplayParts, id::ArchivedEntityId};
use crate::{
    dataset::{PROJECTOR_DIMENSIONS, TemporalAxes, postgres::PostgresDatasetError},
    math::BoxedVecN,
};

/// The type every link entity type descends from.
pub(crate) const LINK_ROOT_BASE_URL: &str =
    "https://blockprotocol.org/@blockprotocol/types/entity-type/link/";

/// Classifies the requested identities against the store's current state.
///
/// One batched read per call, at axes taken at the call itself, so the verdicts describe the
/// store as it stands rather than any fit's frozen view. The answers arrive keyed by identity,
/// and the caller counts them against its requests. An identity the read answers nothing about
/// resolved to no current edition at the read's axes.
///
/// # Errors
///
/// Returns [`PostgresDatasetError`] when the store rejects the read or a row does not decode.
pub(crate) async fn classify_entities(
    store: &impl AsClient,
    ids: impl Iterator<Item = ArchivedEntityId>,
) -> Result<Vec<(ArchivedEntityId, Classification)>, PostgresDatasetError> {
    let (web_ids, entity_uuids) = requests::request_arrays(ids);
    let axes = TemporalAxes::now();
    let statement = classification::classification_statement(&axes, &web_ids, &entity_uuids);

    let rows = store
        .as_client()
        .query(&statement.sql, &statement.parameters)
        .await
        .map_err(PostgresDatasetError::from)?;

    rows.iter()
        .map(|row| classification::decode_classification(row, &statement.columns))
        .collect()
}

/// Reads each requested identity's stored whole-entity embedding as its projector input.
///
/// One batched read per call, bound to identities rather than editions: whichever edition's
/// embedding the store holds answers the request. Each answer is the embedding's leading
/// [`PROJECTOR_DIMENSIONS`] components, l2-normalized inside the statement by the node stream's
/// own expression, so an answer is bit-identical to the representation row a fit reads for the
/// same stored embedding. The answers arrive keyed by identity, and the caller counts them
/// against its requests. An identity the read answers nothing about holds no whole-entity
/// embedding yet.
///
/// # Errors
///
/// Returns [`PostgresDatasetError`] when the store rejects the read or a row does not decode.
pub(crate) async fn read_projector_embeddings(
    store: &impl AsClient,
    ids: impl Iterator<Item = ArchivedEntityId>,
) -> Result<Vec<(ArchivedEntityId, BoxedVecN<PROJECTOR_DIMENSIONS>)>, PostgresDatasetError> {
    let (web_ids, entity_uuids) = requests::request_arrays(ids);
    let statement = embeddings::projector_embedding_statement(&web_ids, &entity_uuids);

    let rows = store
        .as_client()
        .query(&statement.sql, &statement.parameters)
        .await
        .map_err(PostgresDatasetError::from)?;

    rows.iter()
        .map(|row| embeddings::decode_projector_embedding(row, &statement.columns))
        .collect()
}

/// Reads each requested edition's display payload.
///
/// The payload is the edition's cached label and its representative cached type, beside that
/// type's nearest declared icon.
///
/// One batched read per call, keyed by edition rather than identity, because a placement records
/// the edition whose data it captured and an edition id names one immutable row. Every requested
/// edition answers exactly once. An edition without a resolved representative type answers
/// [`None`]. One whose cache holds no label answers the empty label beside its representative,
/// the value a label-less fitted legend carries, and a representative whose chain declares no
/// icon answers the empty icon.
///
/// # Errors
///
/// Returns [`PostgresDatasetError`] when the store rejects the read or a row does not decode.
pub(crate) async fn read_edition_displays(
    store: &impl AsClient,
    editions: impl Iterator<Item = EntityEditionId>,
) -> Result<Vec<(EntityEditionId, Option<DisplayParts>)>, PostgresDatasetError> {
    let edition_ids: Vec<Uuid> = editions.map(|edition| *edition.as_uuid()).collect();
    let statement = edition_display::edition_display_statement(&edition_ids);

    let rows = store
        .as_client()
        .query(&statement.sql, &statement.parameters)
        .await
        .map_err(PostgresDatasetError::from)?;

    rows.iter()
        .map(|row| edition_display::decode_edition_display(row, &statement.columns))
        .collect()
}
