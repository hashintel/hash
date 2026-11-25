//! Turns each row of a sink or link table into a row of the sync table, by the kind of change its
//! `_op` holds. What cannot be turned into a change as it is becomes an [`Issue`].

use alloc::collections::BTreeMap;

use duckdb::types::Value;
use error_stack::Report;
use hash_integrations_definition::{
    ColumnName, EntitySink, LinkPipeline, Properties, UnitMap, UnitMapName,
};
use type_system::{
    knowledge::{entity::id::EntityId, property::PropertyObjectWithMetadata},
    ontology::VersionedUrl,
    principal::actor_group::WebId,
};

use super::{
    entity_id::{LinkEndpoint, derive_entity_id, derive_link_id},
    issues::{Issue, IssueKind},
    pipeline::PreparationError,
    property::{ResolvedProperties, SinkColumns, SinkRow},
};
use crate::{
    run::RunId,
    sync_table::{Op, SyncRow},
};

/// The rows of the sync table a run's tables give, and the issues found on the way.
#[derive(Debug, Default)]
pub(super) struct Changes {
    pub rows: Vec<SyncRow>,
    pub issues: Vec<Issue>,
}

impl Changes {
    /// The text identifying the record `row` describes as an `entity_type`, or `None` after
    /// reporting that the row has none.
    fn source_id(
        &mut self,
        entity_type: &VersionedUrl,
        seq: i64,
        row: SinkRow<'_>,
        column: &ColumnName,
    ) -> Option<String> {
        let source_id = row.text(column);
        if source_id.is_none() {
            self.issues.push(Issue {
                seq,
                kind: IssueKind::MissingSourceId,
                entity_type: entity_type.clone(),
                entity_id: None,
                name: column.as_ref().into(),
                reason: None,
                value: None,
            });
        }
        source_id
    }

    /// The properties of `row`, after reporting each value that could not be converted.
    fn resolve(
        &mut self,
        context: &Context<'_>,
        row: SinkRow<'_>,
        properties: &Properties,
        (entity_type, entity_id, seq): (&VersionedUrl, EntityId, i64),
    ) -> PropertyObjectWithMetadata {
        let ResolvedProperties {
            properties,
            failures,
        } = row.resolve(properties, context.unit_maps);
        self.issues
            .extend(failures.into_iter().map(|failure| Issue {
                seq,
                kind: IssueKind::Property,
                entity_type: entity_type.clone(),
                entity_id: Some(entity_id),
                name: failure.property.to_string().into_boxed_str(),
                reason: Some(failure.reason.to_string().into_boxed_str()),
                value: failure.value.map(String::into_boxed_str),
            }));
        properties
    }
}

/// The kind of change of a row, as its `_op` holds it.
#[derive(Debug, Clone, Copy)]
enum Change {
    Insert,
    Update,
    Delete,
}

/// The positions of `_op` and `_seq` in `columns`.
fn metadata_columns(columns: &[Box<str>]) -> Result<(usize, usize), Report<PreparationError>> {
    let position = |name: &str| {
        columns
            .iter()
            .position(|column| column.eq_ignore_ascii_case(name))
            .ok_or_else(|| {
                Report::new(PreparationError::MissingColumn {
                    column: name.into(),
                })
            })
    };
    Ok((position("_op")?, position("_seq")?))
}

/// The kind of change and the `_seq` of the row `values`.
///
/// # Errors
///
/// Returns [`PreparationError::InvalidChange`] if the row's `_op` is not `insert`, `update` or
/// `delete`.
///
/// # Panics
///
/// Panics if the row's `_seq` is not a BIGINT, which [`Workspace::check_metadata`] refuses for
/// every table whose rows become changes.
///
/// [`Workspace::check_metadata`]: super::workspace::Workspace::check_metadata
fn change_of(
    values: &[Value],
    (op_at, seq_at): (usize, usize),
) -> Result<(Change, i64), Report<PreparationError>> {
    let change = match values.get(op_at) {
        Some(Value::Text(op)) if op == "insert" => Change::Insert,
        Some(Value::Text(op)) if op == "update" => Change::Update,
        Some(Value::Text(op)) if op == "delete" => Change::Delete,
        _ => return Err(Report::new(PreparationError::InvalidChange)),
    };
    let Some(&Value::BigInt(seq)) = values.get(seq_at) else {
        unreachable!("the table's `_seq` should have been checked to be a non-null BIGINT");
    };
    Ok((change, seq))
}

/// What the rows of a run are turned into changes with.
#[derive(Debug, Clone, Copy)]
pub(super) struct Context<'a> {
    pub run: RunId,
    pub web_id: WebId,
    /// The namespace every entity id of the run is derived in.
    pub id_namespace: &'a str,
    pub unit_maps: &'a BTreeMap<UnitMapName, UnitMap>,
}

impl Context<'_> {
    /// Adds the change of each of `rows` to the entity it describes in `sink`.
    ///
    /// An insert creates the entity, an update updates it, and a delete archives it without
    /// properties.
    ///
    /// # Errors
    ///
    /// - [`MissingColumn`] if `columns` has no `_op` or `_seq`
    /// - [`InvalidChange`] if a row's `_op` is not `insert`, `update` or `delete`
    ///
    /// # Panics
    ///
    /// Panics if a row's `_seq` is not a BIGINT.
    ///
    /// [`MissingColumn`]: PreparationError::MissingColumn
    /// [`InvalidChange`]: PreparationError::InvalidChange
    pub(super) fn entity_changes<'row>(
        &self,
        changes: &mut Changes,
        sink: &EntitySink,
        columns: &[Box<str>],
        rows: impl IntoIterator<Item = &'row [Value]>,
    ) -> Result<(), Report<PreparationError>> {
        let metadata = metadata_columns(columns)?;
        let names = columns.iter().collect::<SinkColumns>();
        for values in rows {
            let (change, seq) = change_of(values, metadata)?;
            let row = SinkRow::new(&names, values);
            let Some(source_id) = changes.source_id(&sink.entity_type, seq, row, &sink.entity_id)
            else {
                continue;
            };
            let entity_id = derive_entity_id(
                self.web_id,
                self.id_namespace,
                &sink.entity_type,
                &source_id,
            );
            let target = (&sink.entity_type, entity_id, seq);
            let (op, properties) = match change {
                Change::Insert => (
                    Op::CreateEntity,
                    changes.resolve(self, row, &sink.properties, target),
                ),
                Change::Update => (
                    Op::UpdateEntity,
                    changes.resolve(self, row, &sink.properties, target),
                ),
                Change::Delete => (Op::ArchiveEntity, PropertyObjectWithMetadata::default()),
            };
            changes.rows.push(SyncRow {
                run: self.run,
                seq,
                op,
                entity_id,
                entity_type: sink.entity_type.clone(),
                left_entity_id: None,
                right_entity_id: None,
                properties,
            });
        }
        Ok(())
    }

    /// Adds the change of each of `rows` to the link it describes in `link`.
    ///
    /// The kinds are those of [`entity_changes`](Self::entity_changes). The two ends of a link are
    /// the ids of the entities the same source values give.
    ///
    /// # Errors
    ///
    /// The errors of [`entity_changes`](Self::entity_changes).
    ///
    /// # Panics
    ///
    /// Panics if a row's `_seq` is not a BIGINT.
    pub(super) fn link_changes<'row>(
        &self,
        changes: &mut Changes,
        link: &LinkPipeline,
        columns: &[Box<str>],
        rows: impl IntoIterator<Item = &'row [Value]>,
    ) -> Result<(), Report<PreparationError>> {
        let metadata = metadata_columns(columns)?;
        let names = columns.iter().collect::<SinkColumns>();
        let end = |end: LinkEndpoint<'_>| {
            derive_entity_id(
                self.web_id,
                self.id_namespace,
                end.entity_type,
                end.source_id,
            )
        };
        for values in rows {
            let (change, seq) = change_of(values, metadata)?;
            let row = SinkRow::new(&names, values);
            let Some(left) = changes.source_id(&link.link_type, seq, row, &link.from.column) else {
                continue;
            };
            let Some(right) = changes.source_id(&link.link_type, seq, row, &link.to.column) else {
                continue;
            };
            let left = LinkEndpoint {
                entity_type: &link.from.entity_type,
                source_id: &left,
            };
            let right = LinkEndpoint {
                entity_type: &link.to.entity_type,
                source_id: &right,
            };
            let entity_id =
                derive_link_id(self.web_id, self.id_namespace, &link.link_type, left, right);
            let target = (&link.link_type, entity_id, seq);
            let (op, properties) = match change {
                Change::Insert => (
                    Op::CreateLink,
                    changes.resolve(self, row, &link.properties, target),
                ),
                Change::Update => (
                    Op::UpdateLink,
                    changes.resolve(self, row, &link.properties, target),
                ),
                Change::Delete => (Op::ArchiveLink, PropertyObjectWithMetadata::default()),
            };
            changes.rows.push(SyncRow {
                run: self.run,
                seq,
                op,
                entity_id,
                entity_type: link.link_type.clone(),
                left_entity_id: Some(end(left)),
                right_entity_id: Some(end(right)),
                properties,
            });
        }
        Ok(())
    }
}
