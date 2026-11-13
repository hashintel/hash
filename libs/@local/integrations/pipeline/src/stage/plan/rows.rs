//! Bounded checkpoint reads and validation of persisted engine columns.
use duckdb::types::Value;
use error_stack::Report;
use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    principal::actor_group::WebId,
};
use uuid::Uuid;

use crate::{
    Change, Code, Rows, StageError, Workspace,
    graph::{SinkColumns, SinkRow},
    run::error,
    sql::Identifier,
};

pub(super) const RANGE_ROWS: u64 = 2_048;

pub(super) async fn read_range(
    workspace: &Workspace,
    table: &str,
    start: u64,
) -> Result<Rows, Report<StageError>> {
    let table = Identifier::new(table);
    let end = start.saturating_add(RANGE_ROWS);
    workspace
        .query(
            format!("SELECT * FROM {table} WHERE _row >= {start} AND _row < {end} ORDER BY _row")
                .into_boxed_str(),
        )
        .await
        .map_err(error::statement)
}

pub(super) async fn count(workspace: &Workspace, table: &str) -> Result<u64, Report<StageError>> {
    let rows = workspace
        .query(format!("SELECT count(*) FROM {}", Identifier::new(table)).into_boxed_str())
        .await
        .map_err(error::statement)?;
    let Some([Value::BigInt(count)]) = rows.get(0) else {
        return Err(Code::InvalidCheckpoint.report());
    };
    u64::try_from(*count).map_err(|_error| Code::InvalidCheckpoint.report())
}

pub(super) struct ChangePage {
    rows: Rows,
    columns: SinkColumns,
    row: usize,
    entity_id: usize,
    change: usize,
    source_id: usize,
    key: Option<usize>,
    left: Option<usize>,
    right: Option<usize>,
}

pub(super) struct ChangeRow<'page> {
    pub entity_id: &'page str,
    pub change: Change,
    pub source_id: &'page str,
    pub key: Option<&'page str>,
    pub left: Option<&'page str>,
    pub right: Option<&'page str>,
    pub values: SinkRow<'page>,
}

impl ChangePage {
    pub(super) fn new(rows: Rows) -> Result<Self, Report<StageError>> {
        let find = |name: &str| {
            rows.columns()
                .iter()
                .position(|column| column.eq_ignore_ascii_case(name))
        };
        let required = |name| find(name).ok_or_else(|| Code::InvalidCheckpoint.report());
        Ok(Self {
            columns: rows.columns().iter().collect(),
            row: required("_row")?,
            entity_id: required("_entity_id")?,
            change: required("_change")?,
            source_id: required("_source_id")?,
            key: find("_key"),
            left: find("_left_entity_id"),
            right: find("_right_entity_id"),
            rows,
        })
    }

    pub(super) fn len(&self) -> usize {
        self.rows.iter().len()
    }

    pub(super) fn row(
        &self,
        position: usize,
        number: u64,
    ) -> Result<ChangeRow<'_>, Report<StageError>> {
        let values = self
            .rows
            .get(position)
            .ok_or_else(|| Code::InvalidCheckpoint.report())?;
        if !matches!(values.get(self.row), Some(Value::UBigInt(value)) if *value == number) {
            return Err(Code::InvalidCheckpoint.report());
        }
        let change = match text(values, self.change)? {
            "insert" => Change::Insert,
            "update" => Change::Update,
            "resend" => Change::Resend,
            _ => return Err(Code::InvalidCheckpoint.report()),
        };
        Ok(ChangeRow {
            entity_id: text(values, self.entity_id)?,
            source_id: text(values, self.source_id)?,
            change,
            key: optional_text(values, self.key)?,
            left: optional_text(values, self.left)?,
            right: optional_text(values, self.right)?,
            values: SinkRow::new(&self.columns, values),
        })
    }
}

pub(super) fn text(values: &[Value], index: usize) -> Result<&str, Report<StageError>> {
    match values.get(index) {
        Some(Value::Text(text)) => Ok(text),
        _ => Err(Code::InvalidCheckpoint.report()),
    }
}

fn optional_text(
    values: &[Value],
    index: Option<usize>,
) -> Result<Option<&str>, Report<StageError>> {
    match index.and_then(|index| values.get(index)) {
        Some(Value::Text(text)) => Ok(Some(text)),
        Some(Value::Null) | None => Ok(None),
        _ => Err(Code::InvalidCheckpoint.report()),
    }
}

pub(super) fn parse_entity_id(text: &str) -> Result<EntityId, Report<StageError>> {
    let invalid = || Code::InvalidCheckpoint.report();
    let (web, entity) = text.split_once('~').ok_or_else(invalid)?;
    let entity_id = EntityId {
        web_id: WebId::new(Uuid::parse_str(web).map_err(|_error| invalid())?),
        entity_uuid: EntityUuid::new(Uuid::parse_str(entity).map_err(|_error| invalid())?),
        draft_id: None,
    };
    if entity_id.to_string() != text {
        return Err(invalid());
    }
    Ok(entity_id)
}
