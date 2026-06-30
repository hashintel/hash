use alloc::borrow::Cow;
use core::ops::Range;

use axum::response::{Html, IntoResponse as _};
use error_stack::Report;
use hash_graph_authorization::policies::store::error::{ContextCreationError, DetermineActorError};
use hashql_ast::error::AstDiagnosticCategory;
use hashql_core::span::{SpanId, SpanTable};
use hashql_diagnostics::{
    Diagnostic, DiagnosticCategory, Failure, Label, Message, Sources, Status, Success,
    category::{TerminalDiagnosticCategory, canonical_category_id},
    diagnostic::render::{Format, RenderOptions},
    severity::Critical,
};
use hashql_eval::error::EvalDiagnosticCategory;
use hashql_hir::error::HirDiagnosticCategory;
use hashql_mir::error::MirDiagnosticCategory;
use hashql_syntax_jexpr::{error::JExprDiagnosticCategory, span::Span};
use http::StatusCode;

use super::{
    CompilationOutputOptions,
    value::{JsonValueSerialize, OwnedValue},
};
use crate::rest::{json::Json, status::BoxedResponse};

const INFRASTRUCTURE_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "infrastructure",
    name: "Infrastructure",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum HashQlDiagnosticCategory {
    JExpr(JExprDiagnosticCategory),
    Ast(AstDiagnosticCategory),
    Hir(HirDiagnosticCategory),
    Mir(MirDiagnosticCategory),
    Eval(EvalDiagnosticCategory),
    Infrastructure,
}

impl serde::Serialize for HashQlDiagnosticCategory {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.collect_str(&canonical_category_id(self))
    }
}

impl DiagnosticCategory for HashQlDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("hashql")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("HashQL")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::JExpr(jexpr) => Some(jexpr),
            Self::Ast(ast) => Some(ast),
            Self::Hir(hir) => Some(hir),
            Self::Mir(mir) => Some(mir),
            Self::Eval(eval) => Some(eval),
            Self::Infrastructure => Some(&INFRASTRUCTURE_CATEGORY),
        }
    }
}

pub(crate) fn store_acquire_diagnostic(
    report: &Report<impl core::error::Error>,
    root_span: SpanId,
) -> Diagnostic<HashQlDiagnosticCategory, SpanId, Critical> {
    let mut diagnostic =
        Diagnostic::new(HashQlDiagnosticCategory::Infrastructure, Critical::BUG).primary(
            Label::new(root_span, "failed to acquire database connection"),
        );

    diagnostic.add_message(Message::note(
        "the query compiled successfully but the server could not open a database connection to \
         execute it",
    ));

    log_report(
        &mut diagnostic,
        report,
        "failed to acquire database connection",
    );

    diagnostic
}

pub(crate) fn authorization_context_diagnostic(
    report: &Report<ContextCreationError>,
    root_span: SpanId,
) -> Diagnostic<HashQlDiagnosticCategory, SpanId, Critical> {
    match report.current_context() {
        ContextCreationError::ActorNotFound { actor_id } => {
            actor_not_found(report, root_span, actor_id)
        }
        ContextCreationError::DetermineActor { actor_id } => {
            // DetermineActor wraps either ActorNotFound or StoreError.
            // Only report "does not exist" when the actor was actually looked up
            // and not found; a store error during lookup is infrastructure.
            if report
                .downcast_ref::<DetermineActorError>()
                .is_some_and(|inner| matches!(inner, DetermineActorError::StoreError))
            {
                authorization_context_failed(report, root_span)
            } else {
                actor_not_found(report, root_span, actor_id)
            }
        }
        ContextCreationError::BuildPrincipalContext { .. }
        | ContextCreationError::BuildEntityTypeContext { .. }
        | ContextCreationError::BuildPropertyTypeContext { .. }
        | ContextCreationError::BuildDataTypeContext { .. }
        | ContextCreationError::BuildEntityContext { .. }
        | ContextCreationError::ResolveActorPolicies { .. }
        | ContextCreationError::CreatePolicySet
        | ContextCreationError::CreatePolicyContext
        | ContextCreationError::StoreError => authorization_context_failed(report, root_span),
    }
}

fn actor_not_found(
    report: &Report<ContextCreationError>,
    root_span: SpanId,
    actor_id: &impl core::fmt::Display,
) -> Diagnostic<HashQlDiagnosticCategory, SpanId, Critical> {
    let mut diagnostic =
        Diagnostic::new(HashQlDiagnosticCategory::Infrastructure, Critical::ERROR).primary(
            Label::new(root_span, format!("actor `{actor_id}` does not exist")),
        );

    diagnostic.add_message(Message::note(
        "every request must be authenticated with a valid actor ID; the provided ID does not \
         correspond to any known user or machine",
    ));

    log_report(&mut diagnostic, report, "actor not found");

    diagnostic
}

fn authorization_context_failed(
    report: &Report<ContextCreationError>,
    root_span: SpanId,
) -> Diagnostic<HashQlDiagnosticCategory, SpanId, Critical> {
    let mut diagnostic =
        Diagnostic::new(HashQlDiagnosticCategory::Infrastructure, Critical::BUG).primary(
            Label::new(root_span, "failed to build authorization context"),
        );

    diagnostic.add_message(Message::note(format!(
        "the authorization system reported: {}",
        report.current_context()
    )));

    diagnostic.add_message(Message::help(
        "the query compiled successfully but the server could not resolve the policies needed to \
         authorize execution",
    ));

    log_report(
        &mut diagnostic,
        report,
        "failed to build authorization context",
    );

    diagnostic
}

fn log_report(
    diagnostic: &mut Diagnostic<HashQlDiagnosticCategory, SpanId, Critical>,
    report: &Report<impl core::error::Error>,
    log_message: &str,
) {
    if cfg!(debug_assertions) {
        diagnostic.add_message(Message::note(format!("{report:?}")));
    } else {
        tracing::error!(?report, "{log_message}");
    }
}

#[derive(Debug, serde::Serialize)]
struct PointerSpan {
    pub range: Range<usize>,
    pub pointer: Option<String>,
}

impl PointerSpan {
    fn resolve(id: SpanId, spans: &SpanTable<Span>) -> Option<Self> {
        let absolute = spans.absolute(id)?;

        let mut pointer = None;

        for ancestor in spans.ancestors(id) {
            let Some(span) = spans.get(ancestor) else {
                continue;
            };

            if let Some(span_pointer) = &span.pointer {
                pointer = Some(span_pointer.as_str().to_owned());
                break;
            }
        }

        Some(Self {
            range: absolute.range().into(),
            pointer,
        })
    }
}

pub(crate) fn status_to_response(
    status: Status<OwnedValue, HashQlDiagnosticCategory, SpanId>,
    sources: &Sources<'_>,
    mut spans: &SpanTable<Span>,
    options: &CompilationOutputOptions,
) -> BoxedResponse {
    match status {
        Ok(Success { value, advisories }) => {
            let advisories = advisories.map_spans(|span| PointerSpan::resolve(span, spans));

            if options.json_compat {
                Json(Success {
                    value: JsonValueSerialize(&value),
                    advisories,
                })
                .into_response()
                .into()
            } else {
                Json(Success { value, advisories }).into_response().into()
            }
        }
        Err(Failure { primary, secondary }) => {
            let severity = primary.severity;
            let status_code = if severity == Critical::ERROR {
                StatusCode::BAD_REQUEST
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };

            let mut response = if options.interactive {
                let mut diagnostics = secondary.generalize();
                diagnostics.insert_front(primary.generalize());

                let output =
                    diagnostics.render(RenderOptions::new(Format::Html, sources), &mut spans);
                Html(output).into_response()
            } else {
                Json(Failure {
                    primary: Box::new(primary.map_spans(|span| PointerSpan::resolve(span, spans))),
                    secondary: secondary.map_spans(|span| PointerSpan::resolve(span, spans)),
                })
                .into_response()
            };

            *response.status_mut() = status_code;
            response.into()
        }
    }
}
