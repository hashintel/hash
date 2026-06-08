use alloc::borrow::Cow;
use core::ops::Range;

use axum::response::{Html, IntoResponse as _};
use hashql_ast::error::AstDiagnosticCategory;
use hashql_core::span::{SpanId, SpanTable};
use hashql_diagnostics::{
    DiagnosticCategory, Failure, Sources, Status, Success,
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
