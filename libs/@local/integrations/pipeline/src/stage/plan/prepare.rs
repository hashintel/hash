//! Plan each delivery group from persisted changes and archives.
use duckdb::types::Value;
use error_stack::Report;

use super::{
    rows::{self, ChangePage, ChangeRow, RANGE_ROWS, parse_entity_id},
    target::{Mapping, PlanTarget},
    write::{IssueFile, Write, WriteFile},
};
use crate::{
    Change, Code, Kind, StageError, Workspace,
    graph::{ConversionFailure, OperationKind, Planner},
    run::error,
};

pub(super) async fn upserts(
    workspace: &Workspace,
    planner: &Planner,
    targets: &[PlanTarget<'_>],
    kind: Kind,
    create: bool,
    writes: &mut WriteFile,
    issues: &mut IssueFile,
) -> Result<(), Report<StageError>> {
    for target in targets.iter().filter(|target| target.target.kind() == kind) {
        let count = rows::count(workspace, &target.table).await?;
        let mut start = 0_u64;
        let mut previous = String::new();
        loop {
            let page = ChangePage::new(rows::read_range(workspace, &target.table, start).await?)?;
            if page.len() as u64 != count.saturating_sub(start).min(RANGE_ROWS) {
                return Err(Code::InvalidCheckpoint.report());
            }
            for position in 0..page.len() {
                let row = page.row(position, start + position as u64)?;
                if row.entity_id <= previous.as_str() {
                    return Err(Code::InvalidCheckpoint.report());
                }
                previous.clear();
                previous.push_str(row.entity_id);
                if (row.change == Change::Insert) != create {
                    continue;
                }
                let (write, failures) = plan_row(planner, target, &row)?;
                for failure in &failures {
                    issues.push(target.target, &row, failure).await?;
                }
                writes.push(write).await?;
            }
            start = start.saturating_add(RANGE_ROWS);
            if start >= count {
                break;
            }
        }
    }
    Ok(())
}

fn plan_row(
    planner: &Planner,
    target: &PlanTarget<'_>,
    row: &ChangeRow<'_>,
) -> Result<(Write, Vec<ConversionFailure>), Report<StageError>> {
    let entity_id = parse_entity_id(row.entity_id)?;
    let (operation, left, right, bodies) = match target.mapping {
        Mapping::Entity(sink) => (
            OperationKind::UpsertEntity,
            None,
            None,
            planner.plan_entity(sink, entity_id, row.values),
        ),
        Mapping::Link(link) => {
            let left = row.left.ok_or_else(|| Code::InvalidCheckpoint.report())?;
            let right = row.right.ok_or_else(|| Code::InvalidCheckpoint.report())?;
            (
                OperationKind::UpsertLink,
                Some(left.into()),
                Some(right.into()),
                planner.plan_link(
                    link,
                    entity_id,
                    parse_entity_id(left)?,
                    parse_entity_id(right)?,
                    row.values,
                ),
            )
        }
    };
    let bodies = bodies.map_err(|error| Code::UnencodableRequest.wrap(Report::new(error)))?;
    Ok((
        Write {
            operation,
            change: row.change,
            entity_id: row.entity_id.into(),
            target: target.target.id().into(),
            source_id: row.source_id.into(),
            left,
            right,
            create: Some(bodies.create),
            patch: bodies.patch,
        },
        bodies.failures,
    ))
}

pub(super) async fn archives(
    workspace: &Workspace,
    planner: &Planner,
    writes: &mut WriteFile,
) -> Result<(), Report<StageError>> {
    let invalid = workspace
        .query(
            "SELECT count(*) FROM archives WHERE kind IS NULL OR kind NOT IN ('entity', 'link')"
                .into(),
        )
        .await
        .map_err(error::statement)?;
    if !matches!(invalid.get(0), Some([Value::BigInt(0)])) {
        return Err(Code::InvalidCheckpoint.report());
    }
    for kind in [Kind::Link, Kind::Entity] {
        let table = format!("archives/{kind}");
        workspace
            .create_table(
                table.clone().into_boxed_str(),
                format!(
                    "SELECT CAST(row_number() OVER (ORDER BY target, entity_id) - 1 AS UBIGINT) \
                     AS _row, entity_id, target, source_id FROM archives WHERE kind = '{}'",
                    kind.as_str()
                )
                .into_boxed_str(),
            )
            .await
            .map_err(error::statement)?;
        let operation = match kind {
            Kind::Entity => OperationKind::ArchiveEntity,
            Kind::Link => OperationKind::ArchiveLink,
        };
        let mut start = 0_u64;
        loop {
            let rows = rows::read_range(workspace, &table, start).await?;
            for values in rows.iter() {
                let entity_id = rows::text(values, 1)?;
                let patch = planner
                    .plan_archive(parse_entity_id(entity_id)?)
                    .map_err(|error| Code::UnencodableRequest.wrap(Report::new(error)))?;
                writes
                    .push(Write {
                        operation,
                        change: Change::Archive,
                        entity_id: entity_id.into(),
                        target: rows::text(values, 2)?.into(),
                        source_id: rows::text(values, 3)?.into(),
                        left: None,
                        right: None,
                        create: None,
                        patch,
                    })
                    .await?;
            }
            if (rows.iter().len() as u64) < RANGE_ROWS {
                break;
            }
            start = start.saturating_add(RANGE_ROWS);
        }
    }
    Ok(())
}
