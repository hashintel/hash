//! Loads durable predecessor state without consulting uncommitted send outcomes.
use error_stack::Report;

use super::{BASE, CARRIED, DiffOutput, RESEND, ROW_COLUMNS, create, empty_rows};
use crate::{
    Code, RunContext, RunId, StageError, Workspace,
    run::{current::Current, marker::finished, table::load_table},
    sql::Identifier,
    stage::{plan::PlanOutput, send::SendOutput},
};

fn missing(run: RunId, marker: &str) -> Report<StageError> {
    Code::MarkerMissing
        .report()
        .attach(format!("run {run}, {marker} marker"))
}

pub(super) async fn load(
    context: &RunContext,
    workspace: &Workspace,
    current: &Current,
) -> Result<(), Report<StageError>> {
    if let Some(base) = current.committed {
        let output: DiffOutput = finished(context, &context.namespace.diff_output(base.into()))
            .await?
            .ok_or_else(|| missing(base, "diff"))?;
        load_table(context, workspace, &output.hashes, BASE.into()).await?;
    } else {
        create(workspace, BASE, empty_rows(true)).await?;
    }
    let mut resend = Vec::new();
    let mut carried = Vec::new();
    for (position, run) in current.sending.iter().enumerate() {
        let plan: PlanOutput = finished(context, &context.namespace.plan_output((*run).into()))
            .await?
            .ok_or_else(|| missing(*run, "plan"))?;
        let diff: DiffOutput = finished(context, &context.namespace.diff_output((*run).into()))
            .await?
            .ok_or_else(|| missing(*run, "diff"))?;
        let writes = format!("_diff/sending/{position}/writes");
        let hashes = format!("_diff/sending/{position}/hashes");
        load_table(context, workspace, &plan.writes, writes.clone().into()).await?;
        load_table(context, workspace, &diff.hashes, hashes.clone().into()).await?;
        resend.push(format!(
            "SELECT entity_id FROM {}",
            Identifier::new(&writes)
        ));
        carried.push(format!(
            "SELECT {ROW_COLUMNS}, {position} AS position FROM {} AS h WHERE EXISTS (SELECT 1 \
             FROM {} AS w WHERE w.entity_id = h.entity_id) AND NOT EXISTS (SELECT 1 FROM {} AS b \
             WHERE b.entity_id = h.entity_id)",
            Identifier::new(&hashes),
            Identifier::new(&writes),
            Identifier::new(BASE)
        ));
    }
    if let Some(base) = current.committed {
        let send: SendOutput = finished(context, &context.namespace.send_output(base.into()))
            .await?
            .ok_or_else(|| missing(base, "send"))?;
        if let Some(rejected) = send.rejected {
            load_table(context, workspace, &rejected, "_diff/rejected".into()).await?;
            resend.push("SELECT entity_id FROM \"_diff/rejected\"".to_owned());
        }
    }
    create(
        workspace,
        RESEND,
        if resend.is_empty() {
            "SELECT CAST(NULL AS VARCHAR) AS entity_id WHERE false".to_owned()
        } else {
            format!(
                "SELECT DISTINCT entity_id FROM ({}) AS listed",
                resend.join(" UNION ALL ")
            )
        },
    )
    .await?;
    create(
        workspace,
        CARRIED,
        if carried.is_empty() {
            empty_rows(false)
        } else {
            format!(
                "SELECT {ROW_COLUMNS} FROM ({}) AS candidates QUALIFY row_number() OVER \
                 (PARTITION BY entity_id ORDER BY position DESC) = 1",
                carried.join(" UNION ALL ")
            )
        },
    )
    .await
}
