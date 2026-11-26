//! Turns each row of a sink or link table into a row of the sync table, by its kind of change.
//! What cannot be turned into a change as it is becomes an [`Issue`].

use alloc::collections::BTreeMap;
use core::str::FromStr;

use duckdb::types::Value;
use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::{
    ColumnName, EntitySink, LinkPipeline, Properties, UnitMap, UnitMapName,
};
use type_system::{
    knowledge::entity::id::EntityId, ontology::VersionedUrl, principal::actor_group::WebId,
};

use super::{
    entity_id::{LinkEndpoint, derive_entity_id, derive_link_id},
    issues::Issue,
    pipeline::PreparationError,
    property::{ConversionFailure, ResolvedProperties, SinkColumns, SinkRow},
    workspace::{Identifier, Rows, Workspace},
};
use crate::{
    run::RunId,
    sync_table::{Op, SyncRow},
};

/// The kind of change of a row: the `_change` of a captured row, and the `_op` of a staged one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Change {
    Insert,
    Update,
    Delete,
}

impl Change {
    pub(super) const ALL: [Self; 3] = [Self::Insert, Self::Update, Self::Delete];

    /// The text `_change` and `_op` hold for this kind of change.
    pub(super) const fn as_str(self) -> &'static str {
        match self {
            Self::Insert => "insert",
            Self::Update => "update",
            Self::Delete => "delete",
        }
    }

    const fn entity_op(self) -> Op {
        match self {
            Self::Insert => Op::CreateEntity,
            Self::Update => Op::UpdateEntity,
            Self::Delete => Op::ArchiveEntity,
        }
    }

    const fn link_op(self) -> Op {
        match self {
            Self::Insert => Op::CreateLink,
            Self::Update => Op::UpdateLink,
            Self::Delete => Op::ArchiveLink,
        }
    }
}

impl FromStr for Change {
    type Err = Report<PreparationError>;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        Self::ALL
            .into_iter()
            .find(|change| change.as_str() == text)
            .ok_or_else(|| Report::new(PreparationError::InvalidChange))
    }
}

/// The rows of a sink or link table, with `_op` and `_seq` as their first two values.
pub(super) struct ChangeTable {
    columns: SinkColumns,
    rows: Rows,
}

impl ChangeTable {
    /// Reads all rows of `table`.
    ///
    /// # Errors
    ///
    /// Returns [`PreparationError::Statement`] if the table cannot be read.
    pub(super) fn read(
        workspace: &Workspace,
        table: &str,
    ) -> Result<Self, Report<PreparationError>> {
        let rows = workspace
            .query(&format!(
                "SELECT _op, _seq, * EXCLUDE (_op, _seq) FROM {}",
                Identifier::new(table)
            ))
            .change_context(PreparationError::Statement)?;
        let columns = rows.columns().iter().collect();
        Ok(Self { columns, rows })
    }

    /// Each row with its kind of change.
    ///
    /// # Errors
    ///
    /// Returns [`PreparationError::InvalidChange`] if a row's `_op` is not `insert`, `update` or
    /// `delete`.
    pub(super) fn rows(&self) -> Result<Vec<ChangeRow<'_>>, Report<PreparationError>> {
        self.rows
            .iter()
            .map(|values| ChangeRow::new(&self.columns, values))
            .collect()
    }
}

/// A row of a sink or link table: its kind of change, its `_seq` and its values by column name.
#[derive(Debug, Clone, Copy)]
pub(super) struct ChangeRow<'a> {
    pub change: Change,
    pub seq: i64,
    pub values: SinkRow<'a>,
}

impl<'a> ChangeRow<'a> {
    /// Reads the row `values`, whose first two values are `_op` and `_seq`.
    ///
    /// # Errors
    ///
    /// Returns [`PreparationError::InvalidChange`] if `_op` is not `insert`, `update` or `delete`.
    pub(super) fn new(
        columns: &'a SinkColumns,
        values: &'a [Value],
    ) -> Result<Self, Report<PreparationError>> {
        // `check_metadata` refuses a table whose `_op` is not text or whose `_seq` is not a number.
        let [Value::Text(op), Value::BigInt(seq), ..] = values else {
            unreachable!("`_op` should be text and `_seq` a BIGINT");
        };
        Ok(Self {
            change: op.parse()?,
            seq: *seq,
            values: SinkRow::new(columns, values),
        })
    }

    /// The row's values of `properties`. A delete has none.
    fn properties(
        &self,
        properties: &Properties,
        unit_maps: &BTreeMap<UnitMapName, UnitMap>,
    ) -> ResolvedProperties {
        match self.change {
            Change::Insert | Change::Update => self.values.resolve(properties, unit_maps),
            Change::Delete => ResolvedProperties::default(),
        }
    }
}

/// The rows of the sync table a run's tables give, and the issues found on the way.
#[derive(Debug, Default)]
pub(super) struct Changes {
    pub rows: Vec<SyncRow>,
    pub issues: Vec<Issue>,
}

impl Changes {
    /// The text in `column` that identifies what `row` describes, or `None` after reporting that
    /// it has none.
    fn source_id(
        &mut self,
        row: &ChangeRow<'_>,
        entity_type: &VersionedUrl,
        column: &ColumnName,
    ) -> Option<String> {
        let source_id = row.values.text(column);
        if source_id.is_none() {
            self.issues
                .push(Issue::missing_source_id(row.seq, entity_type, column));
        }
        source_id
    }

    /// Adds `row`, and an issue for each property left out of it.
    fn add(&mut self, row: SyncRow, failures: Vec<ConversionFailure>) {
        self.issues.extend(
            failures
                .into_iter()
                .map(|failure| Issue::property(&row, failure)),
        );
        self.rows.push(row);
    }
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
    /// Adds a change of the entity each of `rows` describes in `sink`: an insert creates it, an
    /// update updates it, and a delete archives it.
    pub(super) fn entity_changes<'row>(
        &self,
        changes: &mut Changes,
        sink: &EntitySink,
        rows: impl IntoIterator<Item = ChangeRow<'row>>,
    ) {
        for row in rows {
            let Some(source_id) = changes.source_id(&row, &sink.entity_type, &sink.entity_id)
            else {
                continue;
            };
            let ResolvedProperties {
                properties,
                failures,
            } = row.properties(&sink.properties, self.unit_maps);
            changes.add(
                SyncRow {
                    run: self.run,
                    seq: row.seq,
                    op: row.change.entity_op(),
                    entity_id: self.entity_id(&sink.entity_type, &source_id),
                    entity_type: sink.entity_type.clone(),
                    left_entity_id: None,
                    right_entity_id: None,
                    properties,
                },
                failures,
            );
        }
    }

    /// Adds a change of the link each of `rows` describes in `link`, as
    /// [`entity_changes`](Self::entity_changes) does for an entity. Each end of the link is the
    /// entity its source id gives.
    pub(super) fn link_changes<'row>(
        &self,
        changes: &mut Changes,
        link: &LinkPipeline,
        rows: impl IntoIterator<Item = ChangeRow<'row>>,
    ) {
        for row in rows {
            let Some(from) = changes.source_id(&row, &link.link_type, &link.from.column) else {
                continue;
            };
            let Some(to) = changes.source_id(&row, &link.link_type, &link.to.column) else {
                continue;
            };
            let left = LinkEndpoint {
                entity_type: &link.from.entity_type,
                source_id: &from,
            };
            let right = LinkEndpoint {
                entity_type: &link.to.entity_type,
                source_id: &to,
            };
            let ResolvedProperties {
                properties,
                failures,
            } = row.properties(&link.properties, self.unit_maps);
            changes.add(
                SyncRow {
                    run: self.run,
                    seq: row.seq,
                    op: row.change.link_op(),
                    entity_id: derive_link_id(
                        self.web_id,
                        self.id_namespace,
                        &link.link_type,
                        left,
                        right,
                    ),
                    entity_type: link.link_type.clone(),
                    left_entity_id: Some(self.entity_id(left.entity_type, &from)),
                    right_entity_id: Some(self.entity_id(right.entity_type, &to)),
                    properties,
                },
                failures,
            );
        }
    }

    fn entity_id(&self, entity_type: &VersionedUrl, source_id: &str) -> EntityId {
        derive_entity_id(self.web_id, self.id_namespace, entity_type, source_id)
    }
}
