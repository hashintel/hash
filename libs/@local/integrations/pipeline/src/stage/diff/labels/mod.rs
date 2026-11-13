//! Global identity checks, coverage-aware classifications, and per-kind archive guards.
use alloc::collections::BTreeMap;

use duckdb::types::Value;
use error_stack::Report;
use hash_integrations_definition::{Coverage, Definition};

use super::{
    BASE, CARRIED, DiffCounts, HASH_COLUMNS, RESEND, RESULT, ROW_COLUMNS, ROWS, TargetRows, create,
    empty_rows,
};
use crate::{
    Code, Kind, StageError, Target, Workspace,
    run::error,
    sql::{Identifier, literal},
    stage::capture::CaptureOutput,
};

#[cfg(test)]
mod tests;

pub(super) struct Counts {
    pub diff: DiffCounts,
    pub limited_archives: u64,
    pub live_base: u64,
}

pub(super) async fn union_rows(
    workspace: &Workspace,
    targets: &[TargetRows],
) -> Result<(), Report<StageError>> {
    let sql = if targets.is_empty() {
        empty_rows(false)
    } else {
        targets
            .iter()
            .map(|rows| {
                format!(
                    "SELECT _entity_id AS entity_id, {} AS kind, {} AS target, _source_id AS \
                     source_id, _content_hash AS content_hash FROM {}",
                    literal(rows.target.kind().as_str()),
                    literal(rows.target.id()),
                    Identifier::new(&rows.table)
                )
            })
            .collect::<Vec<_>>()
            .join(" UNION ALL ")
    };
    create(workspace, ROWS, sql).await
}

pub(super) async fn check_duplicates(workspace: &Workspace) -> Result<(), Report<StageError>> {
    let rows = workspace
        .query(
            format!(
                "SELECT entity_id, CAST(count(*) AS UBIGINT), min(kind || '/' || target), \
                 max(kind || '/' || target), CAST(count(*) OVER () AS UBIGINT) FROM {} GROUP BY \
                 entity_id HAVING count(*) > 1 ORDER BY entity_id LIMIT 5",
                Identifier::new(ROWS)
            )
            .into_boxed_str(),
        )
        .await
        .map_err(error::statement)?;
    let mut examples = Vec::new();
    let mut count = 0;
    for row in rows.iter() {
        let [
            Value::Text(entity_id),
            Value::UBigInt(row_count),
            Value::Text(first),
            Value::Text(last),
            Value::UBigInt(duplicates),
        ] = row
        else {
            return Err(Code::QueryInvalid.report());
        };
        count = *duplicates;
        examples.push(format!(
            "{entity_id}: {row_count} rows, targets {first} through {last}"
        ));
    }
    if examples.is_empty() {
        return Ok(());
    }
    Err(Code::DuplicateEntityId.report().attach(format!(
        "{count} duplicate entity IDs; {}",
        examples.join("; ")
    )))
}

fn protection(
    targets: &[TargetRows],
    definition: Option<&Definition>,
    capture: &CaptureOutput,
) -> String {
    let Some(definition) = definition else {
        return "FALSE".to_owned();
    };
    let protected = targets
        .iter()
        .filter(|rows| {
            rows.sources.iter().any(|name| {
                match definition.sources().get(name).map(|source| source.coverage) {
                    Some(Coverage::Partial) | None => true,
                    Some(Coverage::Complete) => capture
                        .sources
                        .get(name)
                        .is_some_and(|source| source.rows == 0),
                    Some(Coverage::CompleteOrEmpty) => false,
                }
            })
        })
        .map(|rows| literal(&rows.target.to_string()))
        .collect::<Vec<_>>();
    if protected.is_empty() {
        return "FALSE".to_owned();
    }
    let defined = targets
        .iter()
        .map(|rows| literal(&rows.target.to_string()))
        .collect::<Vec<_>>();
    format!(
        "coalesce((p.kind || '/' || p.target) IN ({}) OR (p.kind || '/' || p.target) NOT IN ({}), \
         FALSE)",
        protected.join(", "),
        defined.join(", ")
    )
}

pub(super) async fn label(
    workspace: &Workspace,
    targets: &[TargetRows],
    definition: Option<&Definition>,
    capture: &CaptureOutput,
    resend_all: bool,
) -> Result<(), Report<StageError>> {
    let protected = protection(targets, definition, capture);
    create(
        workspace,
        RESULT,
        format!(
            "WITH prior AS (
            SELECT {HASH_COLUMNS}, TRUE AS in_base FROM {base}
            UNION ALL SELECT {ROW_COLUMNS}, FALSE AS live, FALSE AS in_base FROM {carried}
        ), joined AS (
            SELECT coalesce(r.entity_id, p.entity_id) AS entity_id,
                coalesce(r.kind, p.kind) AS kind, coalesce(r.target, p.target) AS target,
                coalesce(r.source_id, p.source_id) AS source_id,
                coalesce(r.content_hash, p.content_hash) AS content_hash,
                r.entity_id IS NOT NULL AS present, coalesce(p.in_base, FALSE) AS in_base,
                coalesce(p.live, FALSE) AS was_live,
                coalesce(r.content_hash = p.content_hash, FALSE) AS same_hash,
                s.entity_id IS NOT NULL AS resend, {protected} AS protected
            FROM {rows} AS r FULL OUTER JOIN prior AS p ON p.entity_id = r.entity_id
            LEFT JOIN {resend} AS s ON s.entity_id = coalesce(r.entity_id, p.entity_id)
        ) SELECT {ROW_COLUMNS}, present OR (was_live AND protected AND NOT resend) AS live,
            CASE
                WHEN present AND NOT in_base THEN 'insert'
                WHEN present AND NOT was_live THEN 'update'
                WHEN present AND NOT same_hash THEN 'update'
                WHEN present AND (resend OR {resend_all}) THEN 'resend'
                WHEN present THEN NULL
                WHEN NOT in_base THEN 'archive'
                WHEN was_live AND resend THEN 'archive'
                WHEN was_live AND protected THEN NULL
                WHEN was_live THEN 'archive'
                WHEN resend OR {resend_all} THEN 'archive'
                ELSE NULL
            END AS change, present, was_live, resend FROM joined",
            base = Identifier::new(BASE),
            carried = Identifier::new(CARRIED),
            rows = Identifier::new(ROWS),
            resend = Identifier::new(RESEND)
        ),
    )
    .await
}

pub(super) async fn totals(
    workspace: &Workspace,
) -> Result<BTreeMap<Target, Counts>, Report<StageError>> {
    let rows = workspace
        .query(
            format!(
                "SELECT kind, target,
         CAST(count(*) FILTER (WHERE change = 'insert') AS UBIGINT),
         CAST(count(*) FILTER (WHERE change = 'update') AS UBIGINT),
         CAST(count(*) FILTER (WHERE change = 'resend') AS UBIGINT),
         CAST(count(*) FILTER (WHERE change IS NULL AND present) AS UBIGINT),
         CAST(count(*) FILTER (WHERE change = 'archive') AS UBIGINT),
         CAST(count(*) FILTER (WHERE change = 'archive' AND was_live AND NOT resend) AS UBIGINT),
         CAST(count(*) FILTER (WHERE was_live) AS UBIGINT)
         FROM {} GROUP BY kind, target",
                Identifier::new(RESULT)
            )
            .into_boxed_str(),
        )
        .await
        .map_err(error::statement)?;
    rows.iter()
        .map(|row| {
            let [
                Value::Text(kind),
                Value::Text(target),
                Value::UBigInt(inserted),
                Value::UBigInt(updated),
                Value::UBigInt(resent),
                Value::UBigInt(unchanged),
                Value::UBigInt(archived),
                Value::UBigInt(limited_archives),
                Value::UBigInt(live_base),
            ] = row
            else {
                return Err(Code::QueryInvalid.report());
            };
            let kind = kind
                .parse::<Kind>()
                .map_err(|error| Code::QueryInvalid.wrap(error.into()))?;
            let target =
                Target::new(kind, target).map_err(|error| Code::QueryInvalid.wrap(error.into()))?;
            Ok((
                target,
                Counts {
                    diff: DiffCounts {
                        inserted: *inserted,
                        updated: *updated,
                        resent: *resent,
                        unchanged: *unchanged,
                        archived: *archived,
                        without_id: 0,
                    },
                    limited_archives: *limited_archives,
                    live_base: *live_base,
                },
            ))
        })
        .collect()
}

pub(super) fn check_archive_limit(
    counts: &BTreeMap<Target, Counts>,
) -> Result<(), Report<StageError>> {
    for kind in [Kind::Entity, Kind::Link] {
        let (archives, live) = counts
            .iter()
            .filter(|(target, _)| target.kind() == kind)
            .fold((0_u64, 0_u64), |(archives, live), (_, counts)| {
                (
                    archives.saturating_add(counts.limited_archives),
                    live.saturating_add(counts.live_base),
                )
            });
        if archives > 1_000 && archives.saturating_mul(2) > live {
            return Err(Code::ArchiveLimit.report().attach(format!(
                "{kind}: {archives} archives among {live} live base rows"
            )));
        }
    }
    Ok(())
}
