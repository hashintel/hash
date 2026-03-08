//! Mapping from logical entity fields to physical PostgreSQL columns.
//!
//! This module contains [`eval_entity_path`], the single translation table between
//! [`EntityPath`] values (used by MIR traversal analysis) and the physical Postgres schema
//! (spanning `entity_temporal_metadata`, `entity_editions`, `entity_ids`, and edge tables).

use core::alloc::Allocator;

use hash_graph_postgres_store::store::postgres::query::{
    self, Column, ColumnReference, Expression, table,
};
use hashql_core::symbol::sym;
use hashql_mir::pass::execution::traversal::EntityPath;

use super::DatabaseContext;

/// Lowers an [`EntityPath`] to a SQL [`Expression`], requesting joins and allocating parameters
/// as needed.
///
/// Composite paths (e.g. [`EntityPath::RecordId`]) are assembled recursively from their
/// constituent columns.
#[expect(clippy::too_many_lines, reason = "match statement")]
pub(crate) fn eval_entity_path<A: Allocator>(
    db: &mut DatabaseContext<'_, A>,
    path: EntityPath,
) -> Expression {
    match path {
        EntityPath::Properties => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.entity_editions()),
            name: Column::EntityEditions(table::EntityEditions::Properties).into(),
        }),
        EntityPath::Vectors => unreachable!("embeddings are not supported in postgres"),
        EntityPath::RecordId => Expression::Function(query::Function::JsonBuildObject(vec![
            (
                db.parameters.symbol(sym::entity_id).into(),
                eval_entity_path(db, EntityPath::EntityId),
            ),
            (
                db.parameters.symbol(sym::draft_id).into(),
                eval_entity_path(db, EntityPath::DraftId),
            ),
        ])),
        EntityPath::EntityId => Expression::Function(query::Function::JsonBuildObject(vec![
            (
                db.parameters.symbol(sym::web_id).into(),
                eval_entity_path(db, EntityPath::WebId),
            ),
            (
                db.parameters.symbol(sym::entity_uuid).into(),
                eval_entity_path(db, EntityPath::EntityUuid),
            ),
            (
                db.parameters.symbol(sym::draft_id).into(),
                eval_entity_path(db, EntityPath::DraftId),
            ),
        ])),
        EntityPath::WebId => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.temporal_metadata()),
            name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::WebId).into(),
        }),
        EntityPath::EntityUuid => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.temporal_metadata()),
            name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EntityUuid).into(),
        }),
        EntityPath::DraftId => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.temporal_metadata()),
            name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::DraftId).into(),
        }),
        EntityPath::EditionId => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.temporal_metadata()),
            name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::EditionId).into(),
        }),
        EntityPath::TemporalVersioning => {
            Expression::Function(query::Function::JsonBuildObject(vec![
                (
                    db.parameters.symbol(sym::decision_time).into(),
                    eval_entity_path(db, EntityPath::DecisionTime),
                ),
                (
                    db.parameters.symbol(sym::transaction_time).into(),
                    eval_entity_path(db, EntityPath::TransactionTime),
                ),
            ]))
        }
        EntityPath::DecisionTime => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.temporal_metadata()),
            name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::DecisionTime)
                .into(),
        }),
        EntityPath::TransactionTime => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.temporal_metadata()),
            name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::TransactionTime)
                .into(),
        }),
        EntityPath::EntityTypeIds => Expression::ColumnReference(db.projections.entity_type_ids()),
        EntityPath::Archived => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.entity_editions()),
            name: Column::EntityEditions(table::EntityEditions::Archived).into(),
        }),
        EntityPath::Confidence => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.entity_editions()),
            name: Column::EntityEditions(table::EntityEditions::Confidence).into(),
        }),
        EntityPath::ProvenanceInferred => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.entity_ids()),
            name: Column::EntityIds(table::EntityIds::Provenance).into(),
        }),
        EntityPath::ProvenanceEdition => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.entity_editions()),
            name: Column::EntityEditions(table::EntityEditions::Provenance).into(),
        }),
        EntityPath::PropertyMetadata => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.entity_editions()),
            name: Column::EntityEditions(table::EntityEditions::PropertyMetadata).into(),
        }),
        EntityPath::LeftEntityWebId => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.left_entity()),
            name: Column::EntityHasLeftEntity(table::EntityHasLeftEntity::LeftEntityWebId).into(),
        }),
        EntityPath::LeftEntityUuid => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.left_entity()),
            name: Column::EntityHasLeftEntity(table::EntityHasLeftEntity::LeftEntityUuid).into(),
        }),
        EntityPath::RightEntityWebId => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.right_entity()),
            name: Column::EntityHasRightEntity(table::EntityHasRightEntity::RightEntityWebId)
                .into(),
        }),
        EntityPath::RightEntityUuid => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.right_entity()),
            name: Column::EntityHasRightEntity(table::EntityHasRightEntity::RightEntityUuid).into(),
        }),
        EntityPath::LeftEntityConfidence => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.left_entity()),
            name: Column::EntityHasLeftEntity(table::EntityHasLeftEntity::Confidence).into(),
        }),
        EntityPath::RightEntityConfidence => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.right_entity()),
            name: Column::EntityHasRightEntity(table::EntityHasRightEntity::Confidence).into(),
        }),
        EntityPath::LeftEntityProvenance => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.left_entity()),
            name: Column::EntityHasLeftEntity(table::EntityHasLeftEntity::Provenance).into(),
        }),
        EntityPath::RightEntityProvenance => Expression::ColumnReference(ColumnReference {
            correlation: Some(db.projections.right_entity()),
            name: Column::EntityHasRightEntity(table::EntityHasRightEntity::Provenance).into(),
        }),
    }
}
