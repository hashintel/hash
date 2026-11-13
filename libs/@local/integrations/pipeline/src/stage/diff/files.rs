//! Ordered durable files published only after all global guards pass.
use alloc::collections::BTreeMap;

use error_stack::Report;

use super::{
    DiffOutput, HASH_COLUMNS, PreparedRows, RESULT, TargetDiff, TargetRows, labels::Counts,
    rows::table_columns,
};
use crate::{
    ArtifactRef, Kind, RunContext, StageError, Target, Workspace,
    run::{current::Current, table::store_query},
    sql::{Identifier, literal},
};

pub(super) async fn store(
    context: &RunContext,
    workspace: &Workspace,
    prepared: PreparedRows,
    mut totals: BTreeMap<Target, Counts>,
    current: Current,
) -> Result<DiffOutput, Report<StageError>> {
    let hashes = store_query(
        context,
        workspace,
        format!(
            "SELECT {HASH_COLUMNS} FROM {} ORDER BY entity_id",
            Identifier::new(RESULT)
        )
        .into_boxed_str(),
    )
    .await?;
    let archives = store_query(
        context,
        workspace,
        format!(
            "SELECT entity_id, kind, target, source_id FROM {} WHERE change = 'archive' ORDER BY \
             kind, entity_id",
            Identifier::new(RESULT)
        )
        .into_boxed_str(),
    )
    .await?;
    let issues = store_query(
        context,
        workspace,
        format!(
            "SELECT kind, target, entity_id, key, issue, property, reason FROM {} ORDER BY kind, \
             target, key, entity_id, issue, property",
            Identifier::new(&prepared.issues)
        )
        .into_boxed_str(),
    )
    .await?;
    let mut targets = BTreeMap::new();
    for rows in prepared.targets {
        let mut counts = totals
            .remove(&rows.target)
            .map_or_default(|counts| counts.diff);
        let changes = if counts.inserted > 0 || counts.updated > 0 || counts.resent > 0 {
            Some(changes(context, workspace, &rows).await?)
        } else {
            None
        };
        counts.without_id = rows.without_id;
        targets.insert(rows.target, TargetDiff { changes, counts });
    }
    for (target, counts) in totals {
        if counts.diff.archived > 0 {
            targets.insert(
                target,
                TargetDiff {
                    changes: None,
                    counts: counts.diff,
                },
            );
        }
    }
    Ok(DiffOutput {
        base: current.committed,
        resent: current.sending,
        hashes,
        archives,
        issues,
        targets,
    })
}

async fn changes(
    context: &RunContext,
    workspace: &Workspace,
    rows: &TargetRows,
) -> Result<ArtifactRef, Report<StageError>> {
    let mut columns = vec![
        "CAST(row_number() OVER (ORDER BY d.entity_id) - 1 AS UBIGINT) AS _row".to_owned(),
        "d.entity_id AS _entity_id".to_owned(),
        "d.change AS _change".to_owned(),
        "d.source_id AS _source_id".to_owned(),
    ];
    if table_columns(workspace, &rows.table)
        .await?
        .iter()
        .any(|column| column.eq_ignore_ascii_case("_key"))
    {
        columns.push("CAST(t._key AS VARCHAR) AS _key".to_owned());
    }
    if rows.target.kind() == Kind::Link {
        columns.extend([
            "t._left_entity_id".to_owned(),
            "t._right_entity_id".to_owned(),
        ]);
    }
    columns.extend(
        rows.columns
            .iter()
            .map(|column| format!("t.{}", Identifier::new(column))),
    );
    store_query(
        context,
        workspace,
        format!(
            "SELECT {} FROM {} AS t JOIN {} AS d ON d.entity_id = t._entity_id WHERE d.kind = {} \
             AND d.target = {} AND d.change IN ('insert', 'update', 'resend') ORDER BY d.entity_id",
            columns.join(", "),
            Identifier::new(&rows.table),
            Identifier::new(RESULT),
            literal(rows.target.kind().as_str()),
            literal(rows.target.id())
        )
        .into_boxed_str(),
    )
    .await
}
