use alloc::borrow::Cow;
use core::{error::Error, fmt};

use aide::{
    OperationOutput,
    generate::GenContext,
    openapi::{Operation, Response as DocumentedResponse, StatusCode as DocumentedStatus},
};
use axum::{
    body::Body,
    response::{IntoResponse, Response},
};
use error_stack::Report;
use hash_middleware::problem::{InternalServerError, ServiceUnavailable};
use hashql_ast::error::AstDiagnosticCategory;
use hashql_core::span::SpanId;
use hashql_diagnostics::{
    DiagnosticCategory, DiagnosticIssues, Failure, Success,
    category::canonical_category_id,
    diagnostic::render::{Format, RenderOptions},
    issues::AdvisoryDiagnosticIssues,
    severity::Critical,
};
use hashql_eval::error::EvalDiagnosticCategory;
use hashql_hir::error::HirDiagnosticCategory;
use hashql_mir::error::MirDiagnosticCategory;
use hashql_syntax_jexpr::error::JExprDiagnosticCategory;
use http::{HeaderValue, StatusCode, header};
use problematic::{Answer, Expose, Problem, ProblemType, ProblemVariant, Rejection, Variant};
use schemars::{JsonSchema, Schema, SchemaGenerator, json_schema};
use serde::Serialize;

use super::{
    CompilationOutputOptions,
    source::{PointerSpan, RequestSources},
    value::{JsonValueSerialize, OwnedValue},
};
use crate::rest::{extract::Json, openapi};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum HashQlDiagnosticCategory {
    JExpr(JExprDiagnosticCategory),
    Ast(AstDiagnosticCategory),
    Hir(HirDiagnosticCategory),
    Mir(MirDiagnosticCategory),
    Eval(EvalDiagnosticCategory),
}

impl serde::Serialize for HashQlDiagnosticCategory {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.collect_str(&canonical_category_id(self))
    }
}

impl JsonSchema for HashQlDiagnosticCategory {
    fn inline_schema() -> bool {
        true
    }

    fn schema_name() -> Cow<'static, str> {
        Cow::Borrowed("HashQlDiagnosticCategory")
    }

    fn json_schema(_: &mut SchemaGenerator) -> Schema {
        json_schema!({
            "description": "The category of a diagnostic, as the path of its identifiers, such as `hashql::hir::lower::missing-input`.",
            "type": "string"
        })
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
        }
    }
}

type Diagnostics = DiagnosticIssues<HashQlDiagnosticCategory, Option<PointerSpan>>;

/// A failure to run a query that no diagnostic describes.
#[derive(Debug)]
pub(crate) enum QueryError {
    /// No store could be acquired from the pool.
    StoreUnavailable,
    /// The policies that authorize the query's reads could not be resolved for its actor.
    Authorization,
    /// The task that compiles and evaluates the query panicked.
    Panicked,
}

impl fmt::Display for QueryError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(match self {
            Self::StoreUnavailable => "no store could be acquired",
            Self::Authorization => "the authorization context of the query could not be built",
            Self::Panicked => "the query task panicked",
        })
    }
}

impl Error for QueryError {}

/// The diagnostics of a query that failed, the primary diagnostic first.
#[derive(Debug)]
struct FailedQuery {
    severity: Critical,
    diagnostics: Diagnostics,
}

impl fmt::Display for FailedQuery {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            fmt,
            "the query failed with {} diagnostics",
            self.diagnostics.len()
        )
    }
}

impl Error for FailedQuery {}

/// The query has an error, which `diagnostics` describes.
#[derive(Serialize, JsonSchema)]
struct InvalidQuery<'error> {
    /// The diagnostics of the query, the one that failed it first.
    diagnostics: &'error Diagnostics,
}

impl fmt::Display for InvalidQuery<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("The query has an error.")
    }
}

impl ProblemVariant for InvalidQuery<'_> {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Bad Request"),
        status: StatusCode::BAD_REQUEST,
    };
}

/// An error in HashQL itself failed the query, which `diagnostics` describes.
#[derive(Serialize, JsonSchema)]
struct CompilerBug<'error> {
    /// The diagnostics of the query, the one that failed it first.
    diagnostics: &'error Diagnostics,
}

impl fmt::Display for CompilerBug<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("An error in HashQL itself failed the query.")
    }
}

impl ProblemVariant for CompilerBug<'_> {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Internal Server Error"),
        status: StatusCode::INTERNAL_SERVER_ERROR,
    };
}

/// The ways the query endpoint refuses a request its extractors accept.
pub(crate) struct QueryProblem;

impl Problem for QueryProblem {
    const VARIANTS: &'static [Variant] = &[
        Variant::of::<InvalidQuery<'static>>(),
        Variant::of::<CompilerBug<'static>>(),
        Variant::of::<ServiceUnavailable>(),
        Variant::of::<InternalServerError>(),
    ];
}

impl Expose<QueryProblem> for Report<QueryError> {
    fn expose(&self) -> Answer<'_, QueryProblem> {
        match self.current_context() {
            QueryError::StoreUnavailable => Answer::new(ServiceUnavailable),
            QueryError::Authorization | QueryError::Panicked => Answer::new(InternalServerError),
        }
    }
}

impl Expose<QueryProblem> for FailedQuery {
    fn expose(&self) -> Answer<'_, QueryProblem> {
        let diagnostics = &self.diagnostics;
        if self.severity == Critical::ERROR {
            Answer::new(InvalidQuery { diagnostics })
        } else {
            Answer::new(CompilerBug { diagnostics })
        }
    }
}

/// The outcome of a query that did not evaluate to a value.
pub(crate) enum QueryFailure {
    Diagnostics(Failure<HashQlDiagnosticCategory, SpanId>),
    Internal(Report<QueryError>),
}

impl From<Failure<HashQlDiagnosticCategory, SpanId>> for QueryFailure {
    fn from(failure: Failure<HashQlDiagnosticCategory, SpanId>) -> Self {
        Self::Diagnostics(failure)
    }
}

impl From<Report<QueryError>> for QueryFailure {
    fn from(report: Report<QueryError>) -> Self {
        Self::Internal(report)
    }
}

/// The answer to a query that failed.
///
/// The diagnostics of a query are a problem details response, or an HTML page that shows them in
/// the query's source when the request is interactive. Every other failure is a problem details
/// response.
pub(crate) struct QueryRejection {
    rejection: Rejection<QueryProblem>,
    /// The HTML page that is used when interactive mode has been requested, instead of the
    /// rejection.
    html: Option<String>,
}

impl<E> From<E> for QueryRejection
where
    Rejection<QueryProblem>: From<E>,
{
    fn from(error: E) -> Self {
        Self {
            rejection: Rejection::from(error),
            html: None,
        }
    }
}

impl IntoResponse for QueryRejection {
    fn into_response(self) -> Response {
        let Some(page) = self.html else {
            return self.rejection.into_response();
        };

        // The page keeps the extensions of the rejection, through which the middleware records
        // the error.
        let (rejection, _) = http::Response::from(self.rejection).into_parts();

        let mut response = http::Response::from_parts(rejection, Body::from(page));
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static(mime::TEXT_HTML_UTF_8.as_ref()),
        );

        response
    }
}

impl OperationOutput for QueryRejection {
    type Inner = Self;

    fn inferred_responses(
        ctx: &mut GenContext,
        operation: &mut Operation,
    ) -> Vec<(Option<DocumentedStatus>, DocumentedResponse)> {
        let responses = Rejection::<QueryProblem>::inferred_responses(ctx, operation);

        openapi::mark_html_alternative(
            operation,
            [InvalidQuery::TYPE.status, CompilerBug::TYPE.status],
        );

        responses
    }
}

/// A query's value in the encoding its request asks for.
enum EncodedValue {
    /// Every value usses the unstable serialization format (default).
    Unstable(OwnedValue),
    /// The JSON value closest to the value, without the kinds.
    Bare(OwnedValue),
}

impl Serialize for EncodedValue {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Self::Unstable(value) => value.serialize(serializer),
            Self::Bare(value) => JsonValueSerialize(value).serialize(serializer),
        }
    }
}

/// The result of a query.
#[derive(Serialize, JsonSchema)]
pub(crate) struct QueryResponse {
    /// The value the query evaluates to.
    ///
    /// Every value is tagged with its HashQL kind, unless the request sets `Json-Compat`.
    #[schemars(with = "serde_json::Value")]
    value: EncodedValue,
    /// The diagnostics of the query that did not fail it, such as warnings.
    advisories: AdvisoryDiagnosticIssues<HashQlDiagnosticCategory, Option<PointerSpan>>,
}

pub(crate) fn status_to_response(
    status: Result<Success<OwnedValue, HashQlDiagnosticCategory, SpanId>, QueryFailure>,
    sources: &RequestSources<'_>,
    options: &CompilationOutputOptions,
) -> Result<Json<QueryResponse>, QueryRejection> {
    match status {
        Ok(Success { value, advisories }) => Ok(Json(QueryResponse {
            value: if options.json_compat {
                EncodedValue::Bare(value)
            } else {
                EncodedValue::Unstable(value)
            },
            advisories: advisories.map_spans(|span| sources.resolve(span)),
        })),
        Err(QueryFailure::Internal(report)) => Err(report.into()),
        Err(QueryFailure::Diagnostics(Failure { primary, secondary })) => {
            let severity = primary.severity;

            let mut diagnostics = secondary.generalize();
            diagnostics.insert_front(primary.generalize());

            let html = options.interactive.then(|| {
                diagnostics.render(
                    RenderOptions::new(Format::Html, sources.table().sources()),
                    &mut sources.table(),
                )
            });
            let failed = FailedQuery {
                severity,
                diagnostics: diagnostics.map_spans(|span| sources.resolve(span)),
            };

            Err(QueryRejection {
                rejection: failed.into(),
                html,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;

    use axum::{body::to_bytes, response::IntoResponse as _};
    use hashql_core::{
        heap::{Heap, Scratch},
        span::SpanId,
    };
    use hashql_diagnostics::{DiagnosticIssues, Status, Success, severity::Critical};
    use http::{StatusCode, header::CONTENT_TYPE};
    use serde_json::json;

    use super::{
        CompilationOutputOptions, HashQlDiagnosticCategory, QueryFailure, QueryRejection,
        QueryResponse, status_to_response,
    };
    use crate::rest::{
        extract::Json,
        internal::hashql::{compile::Compilation, source::InputValues, value::OwnedValue},
        test_utils::response_json,
    };

    /// Answers the query `source` with the outcome that `run` gives its compilation.
    fn answer(
        source: &str,
        inputs: &InputValues,
        options: &CompilationOutputOptions,
        run: impl for<'heap> FnOnce(
            Status<Compilation<'heap>, HashQlDiagnosticCategory, SpanId>,
        ) -> Result<
            Success<OwnedValue, HashQlDiagnosticCategory, SpanId>,
            QueryFailure,
        >,
    ) -> Result<Json<QueryResponse>, QueryRejection> {
        let heap = Heap::new();
        let (compiled, sources) = Compilation::compile(&heap, &mut Scratch::new(), source, inputs);

        status_to_response(run(compiled), &sources, options)
    }

    fn response_value(json_compat: bool) -> serde_json::Value {
        let Ok(Json(response)) = answer(
            r##"{"#literal": 1}"##,
            &InputValues::default(),
            &CompilationOutputOptions {
                interactive: false,
                json_compat,
            },
            |_| {
                Ok(Success {
                    value: OwnedValue::Tuple(vec![OwnedValue::String(Arc::from("a"))]),
                    advisories: DiagnosticIssues::new(),
                })
            },
        ) else {
            panic!("a value should be answered as a response");
        };

        serde_json::to_value(response).expect("the response should serialize")
    }

    #[test]
    fn response_value_tagged() {
        assert_eq!(
            response_value(false),
            json!({"value": {"Tuple": [{"String": "a"}]}, "advisories": []})
        );
    }

    #[test]
    fn response_value_json_compat() {
        assert_eq!(
            response_value(true),
            json!({"value": ["a"], "advisories": []})
        );
    }

    /// A diagnostic more severe than an error is answered `500` in either media type.
    #[test]
    fn bug_internal_server_error() {
        for (interactive, media_type) in [
            (false, "application/problem+json"),
            (true, "text/html; charset=utf-8"),
        ] {
            let Err(rejection) = answer(
                r#"{"not": "a query"}"#,
                &InputValues::default(),
                &CompilationOutputOptions {
                    interactive,
                    json_compat: false,
                },
                |compiled| {
                    let mut failure = compiled.err().expect("the query should fail to compile");
                    failure.primary.severity = Critical::BUG;
                    Err(failure.into())
                },
            ) else {
                panic!("a query that failed should be rejected");
            };

            let response = rejection.into_response();
            assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
            assert_eq!(response.headers()[CONTENT_TYPE], media_type);
        }
    }

    /// Rejects the query `["input", "x", "Integer"]` for the value `"a"` of `x`.
    fn mistyped_input(interactive: bool) -> QueryRejection {
        let inputs =
            serde_json::from_str(r##"{"x": {"#literal": "a"}}"##).expect("the values should parse");

        let Err(rejection) = answer(
            r#"["input", "x", "Integer"]"#,
            &inputs,
            &CompilationOutputOptions {
                interactive,
                json_compat: false,
            },
            |compiled| Err(compiled.err().expect("the value should be refused").into()),
        ) else {
            panic!("a query that failed should be rejected");
        };

        rejection
    }

    #[tokio::test]
    async fn input_spans() {
        let problem = response_json(mistyped_input(false).into_response()).await;

        let spans: Vec<_> = problem["diagnostics"][0]["labels"]["labels"]
            .as_array()
            .expect("the diagnostic should have labels")
            .iter()
            .map(|label| &label["span"])
            .collect();

        assert_eq!(
            json!(spans),
            json!([
                {"location": "inputs.x", "range": {"start": 13, "end": 16}, "pointer": "/#literal"},
                {"location": "query", "range": {"start": 16, "end": 23}, "pointer": "/2"},
            ])
        );
    }

    #[tokio::test]
    async fn input_page() {
        let page = to_bytes(mistyped_input(true).into_response().into_body(), usize::MAX)
            .await
            .expect("the response body should be readable");
        let page = String::from_utf8(page.into()).expect("the page should be UTF-8");

        assert!(page.contains("inputs.x:1:14"));
        assert!(page.contains("query:1:17"));
    }
}
