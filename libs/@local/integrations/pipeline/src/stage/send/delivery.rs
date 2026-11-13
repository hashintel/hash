//! Sequential delivery, retry tables and one permitted create/patch fallback.
use std::collections::HashSet;

use error_stack::Report;
use serde_json::value::RawValue;

use super::{SendGuard, writes::Write};
use crate::{
    Code, SendSettings, StageError,
    graph::{Graph, GraphResponse, OperationKind, RequestKind},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Outcome {
    Created,
    Patched,
    Archived,
    Absent,
    Rejected { status: Option<u16>, reason: Reason },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Reason {
    GraphStatus,
    EndpointRejected,
    NotFoundAfterConflict,
    ConflictAfterNotFound,
}

impl Reason {
    pub(super) const fn as_str(self) -> &'static str {
        match self {
            Self::GraphStatus => "graph_status",
            Self::EndpointRejected => "endpoint_rejected",
            Self::NotFoundAfterConflict => "not_found_after_conflict",
            Self::ConflictAfterNotFound => "conflict_after_not_found",
        }
    }
}

impl SendSettings {
    fn wait(&self, attempts: u32) -> core::time::Duration {
        self.first_wait
            .saturating_mul(1 << attempts.saturating_sub(1).min(6))
            .min(self.longest_wait)
    }
}

async fn request(
    guard: &SendGuard<'_>,
    graph: &impl Graph,
    kind: RequestKind,
    bodies: &[&RawValue],
) -> Result<Option<u16>, Report<StageError>> {
    let settings = &guard.context.send;
    let single = bodies.len() == 1;
    let mut attempt = 1;
    loop {
        guard.check().await?;
        let response = match kind {
            RequestKind::Create => graph.create(guard.input.actor, bodies).await,
            RequestKind::Patch => graph.patch(guard.input.actor, bodies).await,
        };
        let unavailable = match response {
            GraphResponse::Applied => return Ok(None),
            GraphResponse::Unreachable | GraphResponse::Status(429 | 502 | 503 | 504) => true,
            GraphResponse::Status(499) if single => true,
            GraphResponse::Status(500) if single => false,
            GraphResponse::Status(status) => return Ok(Some(status)),
        };
        if attempt >= settings.max_attempts {
            return if unavailable {
                Err(Code::GraphUnavailable
                    .report()
                    .attach(format!("{response:?}")))
            } else {
                Ok(Some(500))
            };
        }
        tokio::time::sleep(settings.wait(attempt)).await;
        attempt += 1;
    }
}

async fn single(
    guard: &SendGuard<'_>,
    graph: &impl Graph,
    write: &Write,
) -> Result<Outcome, Report<StageError>> {
    let reject = |status, reason| Outcome::Rejected {
        status: Some(status),
        reason,
    };
    let Some(status) = request(guard, graph, write.first_kind(), &[write.first_body()]).await?
    else {
        return Ok(write.first_outcome());
    };
    if matches!(
        write.operation,
        OperationKind::ArchiveLink | OperationKind::ArchiveEntity
    ) {
        return Ok(if status == 404 {
            Outcome::Absent
        } else {
            reject(status, Reason::GraphStatus)
        });
    }
    let (fallback, body, outcome, opposite, reason) = match (write.first_kind(), status) {
        (RequestKind::Create, 409) => (
            RequestKind::Patch,
            write.patch.as_ref(),
            Outcome::Patched,
            404,
            Reason::NotFoundAfterConflict,
        ),
        (RequestKind::Patch, 404) => (
            RequestKind::Create,
            write
                .create
                .as_deref()
                .expect("should have validated upsert body"),
            Outcome::Created,
            409,
            Reason::ConflictAfterNotFound,
        ),
        _ => return Ok(reject(status, Reason::GraphStatus)),
    };
    Ok(match request(guard, graph, fallback, &[body]).await? {
        None => outcome,
        Some(status) if status == opposite => reject(status, reason),
        Some(status) => reject(status, Reason::GraphStatus),
    })
}

fn endpoint_rejected(write: &Write, rejected: &HashSet<Box<str>>) -> bool {
    write.operation == OperationKind::UpsertLink
        && [write.left.as_ref(), write.right.as_ref()]
            .into_iter()
            .flatten()
            .any(|id| rejected.contains(id))
}

pub(super) async fn batch(
    guard: &SendGuard<'_>,
    graph: &impl Graph,
    writes: &[Write],
    rejected: &HashSet<Box<str>>,
) -> Result<Vec<Outcome>, Report<StageError>> {
    let open: Vec<_> = writes
        .iter()
        .filter(|write| !endpoint_rejected(write, rejected))
        .collect();
    let mut sent = Vec::with_capacity(open.len());
    match open.as_slice() {
        [] => {}
        [write] => sent.push(single(guard, graph, write).await?),
        [first, ..] => {
            let bodies: Vec<_> = open.iter().map(|write| write.first_body()).collect();
            if request(guard, graph, first.first_kind(), &bodies)
                .await?
                .is_none()
            {
                sent.extend(open.iter().map(|write| write.first_outcome()));
            } else {
                for write in open {
                    sent.push(single(guard, graph, write).await?);
                }
            }
        }
    }
    let mut sent = sent.into_iter();
    Ok(writes
        .iter()
        .map(|write| {
            if endpoint_rejected(write, rejected) {
                Outcome::Rejected {
                    status: None,
                    reason: Reason::EndpointRejected,
                }
            } else {
                sent.next()
                    .expect("should have one outcome per attempted write")
            }
        })
        .collect())
}
