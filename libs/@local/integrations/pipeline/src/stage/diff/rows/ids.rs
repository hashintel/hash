use duckdb::types::Value;
use error_stack::Report;
use type_system::principal::actor_group::WebId;

use super::{
    pipelines::{IdSource, PreparedTarget},
    table_columns,
};
use crate::{
    Code, Format, Kind, LinkEndpoint, RunContext, RunInput, SourceCapture, StageError, Workspace,
    entity_id::{derive_entity_id, derive_link_ids, source_id},
    pipeline::accessor_columns,
    run::{
        error,
        table::{Cell, Column, ColumnKind, RowFile},
    },
    sql::{Identifier, literal},
    stage::diff::TargetRows,
};

const RANGE_ROWS: u64 = 0x0001_0000;
const ENTITY_COLUMNS: [Column; 3] = [
    Column {
        name: "_row",
        kind: ColumnKind::UInt64,
        nullable: false,
    },
    Column {
        name: "_entity_id",
        kind: ColumnKind::Text,
        nullable: true,
    },
    Column {
        name: "_source_id",
        kind: ColumnKind::Text,
        nullable: true,
    },
];
const LINK_COLUMNS: [Column; 5] = [
    ENTITY_COLUMNS[0],
    ENTITY_COLUMNS[1],
    ENTITY_COLUMNS[2],
    Column {
        name: "_left_entity_id",
        kind: ColumnKind::Text,
        nullable: true,
    },
    Column {
        name: "_right_entity_id",
        kind: ColumnKind::Text,
        nullable: true,
    },
];

#[tracing::instrument(level = "debug", skip_all, fields(target = %target.target))]
pub(super) async fn assign(
    context: &RunContext,
    workspace: &Workspace,
    input: &RunInput,
    target: PreparedTarget,
) -> Result<(TargetRows, Option<String>), Report<StageError>> {
    let table_columns = table_columns(workspace, &target.table).await?;
    let mut columns = Vec::new();
    for (column, _) in accessor_columns(&target.properties) {
        let name = table_columns
            .iter()
            .find(|name| name.eq_ignore_ascii_case(column.as_ref()))
            .ok_or_else(|| Code::QueryInvalid.report())?;
        if !columns.contains(name) {
            columns.push(name.clone());
        }
    }
    let is_link = matches!(target.ids, IdSource::Link { .. });
    let (capture, without_id) = write_ids(context, workspace, input, &target).await?;
    let path = capture.path().to_owned();
    let ids_table = format!("_ids/{}", target.target);
    let loaded = workspace
        .load_capture(capture, ids_table.clone().into_boxed_str())
        .await
        .map_err(error::capture);
    if let Err(error) = tokio::fs::remove_file(path).await {
        tracing::warn!(%error, "could not remove the entity ID file");
    }
    loaded?;
    let final_table = format!("_target/{}", target.target);
    let endpoints = if is_link {
        ", ids._left_entity_id, ids._right_entity_id"
    } else {
        ""
    };
    workspace
        .create_table(
            final_table.clone().into_boxed_str(),
            format!(
                "SELECT source.*, ids._entity_id, ids._source_id{endpoints} FROM {} AS source \
                 JOIN {} AS ids ON source.rowid = CAST(ids._row AS BIGINT) WHERE ids._entity_id \
                 IS NOT NULL",
                Identifier::new(&target.table),
                Identifier::new(&ids_table)
            )
            .into_boxed_str(),
        )
        .await
        .map_err(error::statement)?;
    let missing = (without_id > 0).then(|| {
        let key = if table_columns
            .iter()
            .any(|name| name.eq_ignore_ascii_case("_key"))
        {
            "CAST(source._key AS VARCHAR)"
        } else {
            "CAST(NULL AS VARCHAR)"
        };
        let issue = match target.target.kind() {
            Kind::Entity => "missing_id",
            Kind::Link => "missing_endpoint",
        };
        format!(
            "SELECT {} AS kind, {} AS target, CAST(NULL AS VARCHAR) AS entity_id, {key} AS key, \
             {} AS issue, CAST(NULL AS VARCHAR) AS property, CAST(NULL AS VARCHAR) AS reason FROM \
             {} AS ids JOIN {} AS source ON source.rowid = CAST(ids._row AS BIGINT) WHERE \
             ids._entity_id IS NULL",
            literal(target.target.kind().as_str()),
            literal(target.target.id()),
            literal(issue),
            Identifier::new(&ids_table),
            Identifier::new(&target.table)
        )
    });
    Ok((
        TargetRows {
            target: target.target,
            table: final_table.into_boxed_str(),
            columns,
            sources: target.sources,
            without_id,
        },
        missing,
    ))
}

/// Owns one bounded writer across blocking tasks; only one range's ID inputs crosses at a time.
async fn write_ids(
    context: &RunContext,
    workspace: &Workspace,
    input: &RunInput,
    target: &PreparedTarget,
) -> Result<(SourceCapture, u64), Report<StageError>> {
    let path = context.scratch_file(Format::Parquet);
    let is_link = matches!(target.ids, IdSource::Link { .. });
    let mut file = tokio::task::spawn_blocking(move || {
        RowFile::create_at(
            path,
            if is_link {
                &LINK_COLUMNS
            } else {
                &ENTITY_COLUMNS
            },
        )
    })
    .await
    .map_err(error::scratch)??;
    let summary = workspace
        .query(
            format!(
                "SELECT count(*), min(rowid), max(rowid) FROM {}",
                Identifier::new(&target.table)
            )
            .into_boxed_str(),
        )
        .await
        .map_err(error::statement)?;
    let mut without_id = 0;
    match summary.iter().next() {
        Some([Value::BigInt(0), Value::Null, Value::Null]) => {}
        Some(
            [
                Value::BigInt(total),
                Value::BigInt(first),
                Value::BigInt(last),
            ],
        ) => {
            let total = unsigned(*total)?;
            let mut start = unsigned(*first)?;
            let last = unsigned(*last)?;
            let mut read = 0;
            let selected = match &target.ids {
                IdSource::Entity { column, .. } => Identifier::new(column.as_ref()).to_string(),
                IdSource::Link { from, to, .. } => format!(
                    "{}, {}",
                    Identifier::new(from.column.as_ref()),
                    Identifier::new(to.column.as_ref())
                ),
            };
            while start <= last {
                let end = start.saturating_add(RANGE_ROWS);
                let rows = workspace
                    .query(
                        format!(
                            "SELECT rowid, {selected} FROM {} WHERE rowid >= {start} AND rowid < \
                             {end}",
                            Identifier::new(&target.table)
                        )
                        .into_boxed_str(),
                    )
                    .await
                    .map_err(error::statement)?;
                let ids = target.ids.clone();
                let namespace = input.namespace.clone();
                let web = input.web;
                let (next, missing, count) = tokio::task::spawn_blocking(move || {
                    let mut missing = 0;
                    let count = rows.iter().len();
                    for values in rows.iter() {
                        let cells = id_cells(&ids, web, &namespace, values)?;
                        missing += u64::from(matches!(cells.get(1), Some(Cell::Null)));
                        file.push(&cells)?;
                    }
                    Ok::<_, Report<StageError>>((file, missing, count))
                })
                .await
                .map_err(error::scratch)??;
                file = next;
                without_id += missing;
                read += u64::try_from(count).map_err(|error| Code::RowKey.wrap(error.into()))?;
                start = end;
            }
            if read != total {
                return Err(Code::RowKey.report());
            }
        }
        _ => return Err(Code::RowKey.report()),
    }
    let capture = tokio::task::spawn_blocking(move || file.close())
        .await
        .map_err(error::scratch)??;
    Ok((capture, without_id))
}

fn unsigned(number: i64) -> Result<u64, Report<StageError>> {
    u64::try_from(number).map_err(|error| Code::RowKey.wrap(error.into()))
}

fn id_cells(
    ids: &IdSource,
    web: WebId,
    namespace: &str,
    values: &[Value],
) -> Result<Vec<Cell>, Report<StageError>> {
    let Some((Value::BigInt(row), values)) = values.split_first() else {
        return Err(Code::RowKey.report());
    };
    let mut cells = vec![Cell::UInt(unsigned(*row)?)];
    match (ids, values) {
        (IdSource::Entity { entity_type, .. }, [id]) => {
            if let Some(source_id) = source_id(id) {
                cells.push(Cell::Text(
                    derive_entity_id(web, namespace, entity_type, &source_id)
                        .to_string()
                        .into_boxed_str(),
                ));
                cells.push(Cell::Text(source_id.into_boxed_str()));
            } else {
                cells.extend([Cell::Null, Cell::Null]);
            }
        }
        (
            IdSource::Link {
                link_type,
                from,
                to,
            },
            [left, right],
        ) => {
            if let (Some(left), Some(right)) = (source_id(left), source_id(right)) {
                let ids = derive_link_ids(
                    web,
                    namespace,
                    link_type,
                    LinkEndpoint {
                        entity_type: &from.entity_type,
                        source_id: &left,
                    },
                    LinkEndpoint {
                        entity_type: &to.entity_type,
                        source_id: &right,
                    },
                );
                cells.extend([
                    Cell::Text(ids.link_id.to_string().into_boxed_str()),
                    Cell::Text(ids.source_id.into_boxed_str()),
                    Cell::Text(ids.left_entity_id.to_string().into_boxed_str()),
                    Cell::Text(ids.right_entity_id.to_string().into_boxed_str()),
                ]);
            } else {
                cells.extend([Cell::Null, Cell::Null, Cell::Null, Cell::Null]);
            }
        }
        _ => return Err(Code::RowKey.report()),
    }
    Ok(cells)
}
