//! Mapping from logical entity fields to physical PostgreSQL columns.
//!
//! This module contains [`eval_entity_path`], the single translation table between
//! [`EntityPath`] values (used by MIR traversal analysis) and the physical Postgres schema
//! (spanning `entity_temporal_metadata`, `entity_editions`, `entity_ids`, and edge tables).

use core::alloc::Allocator;

use hash_graph_postgres_store::store::postgres::query::{
    self, Column, ColumnReference, Constant, Expression, table,
};
use hashql_core::symbol::sym;
use hashql_mir::pass::execution::traversal::EntityPath;

use super::DatabaseContext;

/// Decomposes a `tstzrange` into a `LeftClosedTemporalInterval` JSONB representation.
///
/// A `LeftClosedTemporalInterval` has:
/// - `start`: always `InclusiveTemporalBound` (just the epoch-ms integer)
/// - `end`: `ExclusiveTemporalBound` (epoch-ms integer) or `UnboundedTemporalBound` (`null`)
///
/// Produces:
/// ```sql
/// jsonb_build_object(
///     'start', (extract(epoch from lower(range)) * 1000)::int8,
///     'end',   CASE WHEN upper_inf(range) THEN NULL
///                   ELSE (extract(epoch from upper(range)) * 1000)::int8
///              END
/// )
/// ```
///
/// The epoch values are milliseconds since Unix epoch, matching the HashQL
/// `Timestamp` representation. The start bound needs no conditional because
/// `LeftClosedTemporalInterval` guarantees it is always inclusive. The end
/// bound uses `upper_inf` to distinguish `ExclusiveTemporalBound` (finite)
/// from `UnboundedTemporalBound` (infinite).
fn eval_tstzrange_as_left_closed_interval<A: Allocator>(
    db: &mut DatabaseContext<'_, A>,
    range: Expression,
) -> Expression {
    let lower = Expression::Function(query::Function::Lower(Box::new(range.clone())));
    let upper = Expression::Function(query::Function::Upper(Box::new(range.clone())));
    let upper_inf = Expression::Function(query::Function::UpperInf(Box::new(range)));

    let start_ms = Expression::Function(query::Function::ExtractEpochMs(Box::new(lower)));

    // end: NULL for unbounded, epoch-ms for exclusive
    let upper_ms = Expression::Function(query::Function::ExtractEpochMs(Box::new(upper)));
    let end_bound = Expression::CaseWhen {
        conditions: vec![(upper_inf, Expression::Constant(Constant::Null))],
        else_result: Some(Box::new(upper_ms)),
    };

    let start_key = db.parameters.symbol(sym::start).into();
    let end_key = db.parameters.symbol(sym::end).into();

    Expression::Function(query::Function::JsonBuildObject(vec![
        (start_key, start_ms),
        (end_key, end_bound),
    ]))
}

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
        EntityPath::Vectors => unreachable!(
            "entity vectors should never reach postgres compilation; the placement pass should \
             have rejected this"
        ),
        EntityPath::RecordId => Expression::Function(query::Function::JsonBuildObject(vec![
            (
                db.parameters.symbol(sym::entity_id).into(),
                eval_entity_path(db, EntityPath::EntityId),
            ),
            (
                db.parameters.symbol(sym::edition_id).into(),
                eval_entity_path(db, EntityPath::EditionId),
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
        EntityPath::DecisionTime => {
            let range = Expression::ColumnReference(ColumnReference {
                correlation: Some(db.projections.temporal_metadata()),
                name: Column::EntityTemporalMetadata(table::EntityTemporalMetadata::DecisionTime)
                    .into(),
            });

            eval_tstzrange_as_left_closed_interval(db, range)
        }
        EntityPath::TransactionTime => {
            let range = Expression::ColumnReference(ColumnReference {
                correlation: Some(db.projections.temporal_metadata()),
                name: Column::EntityTemporalMetadata(
                    table::EntityTemporalMetadata::TransactionTime,
                )
                .into(),
            });

            eval_tstzrange_as_left_closed_interval(db, range)
        }
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
