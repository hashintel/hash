//! Extractors whose rejections are problem documents.
//!
//! The framework's own extractors answer plain-text rejections, which would break the API's
//! every-error-is-a-problem-document contract. [`Body`] wraps JSON request bodies - an absent
//! body answers the `missing-body` problem, a body that is not the operation's JSON answers
//! `invalid-body`. [`Coordinates`] wraps the numeric tile-address segments so an unparsable
//! `z/x/y` answers `invalid-coordinate`, and [`Generation`] wraps the generation-bearing
//! segments so a malformed generation id answers `invalid-generation`. All three delegate their
//! OpenAPI schemas to the extractor they wrap, so the documented contract is unchanged.

#![expect(
    clippy::field_scoped_visibility_modifiers,
    reason = "handlers in sibling modules destructure the wrappers - the axum extractor pattern - \
              and pub(super) is the narrowest visibility that permits it"
)]

use aide::{OperationInput, generate::GenContext, openapi};
use axum::{
    Json,
    extract::{
        FromRequest, FromRequestParts, OptionalFromRequest, Path, Request, rejection::JsonRejection,
    },
    http::{StatusCode, request::Parts},
};
use schemars::JsonSchema;
use serde::de::DeserializeOwned;

use super::problem::{Problem, ProblemType};

/// A JSON request body whose rejections are problem documents.
///
/// [`Json`] with the failure paths routed into the problem surface: a request without a body
/// answers `missing-body` when the body is required (`Option<Body<T>>` reads an absent body as
/// `None`), and a present body that is not the operation's JSON - wrong content type, syntax
/// error, shape mismatch, oversize - answers `invalid-body` with the framework's parse failure
/// as its detail and status. The detail is a request echo, never server state.
#[derive(Debug)]
pub(super) struct Body<T>(pub(super) T);

impl<T, S> FromRequest<S> for Body<T>
where
    T: DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = Problem<'static>;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        match <Json<T> as OptionalFromRequest<S>>::from_request(req, state).await {
            Ok(Some(Json(body))) => Ok(Self(body)),
            Ok(None) => Err(Problem::new(
                StatusCode::BAD_REQUEST,
                ProblemType::MissingBody,
                "the operation's subject rides a required JSON body",
            )),
            Err(rejection) => Err(invalid_body(&rejection)),
        }
    }
}

impl<T, S> OptionalFromRequest<S> for Body<T>
where
    T: DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = Problem<'static>;

    async fn from_request(req: Request, state: &S) -> Result<Option<Self>, Self::Rejection> {
        match <Json<T> as OptionalFromRequest<S>>::from_request(req, state).await {
            Ok(body) => Ok(body.map(|Json(body)| Self(body))),
            Err(rejection) => Err(invalid_body(&rejection)),
        }
    }
}

impl<T: JsonSchema> OperationInput for Body<T> {
    fn operation_input(ctx: &mut GenContext, operation: &mut openapi::Operation) {
        Json::<T>::operation_input(ctx, operation);
    }
}

/// The `invalid-body` problem for one JSON rejection.
///
/// The framework's status survives - a syntax error stays 400, a wrong content type 415, an
/// oversize body 413 - and its message rides as the detail: parse positions and expected
/// shapes are the crate's contract-safe request echoes.
fn invalid_body(rejection: &JsonRejection) -> Problem<'static> {
    Problem::new(
        rejection.status(),
        ProblemType::InvalidBody,
        rejection.body_text(),
    )
}

/// The numeric tile-address segments, whose parse failure answers `invalid-coordinate`.
///
/// [`Path`] with the rejection routed into the problem surface.
#[derive(Debug)]
pub(super) struct Coordinates<T>(pub(super) T);

impl<T, S> FromRequestParts<S> for Coordinates<T>
where
    T: DeserializeOwned + Send,
    S: Send + Sync,
{
    type Rejection = Problem<'static>;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        Path::<T>::from_request_parts(parts, state)
            .await
            .map(|Path(inner)| Self(inner))
            .map_err(|rejection| {
                Problem::new(
                    StatusCode::BAD_REQUEST,
                    ProblemType::InvalidCoordinate,
                    rejection.body_text(),
                )
            })
    }
}

impl<T: JsonSchema> OperationInput for Coordinates<T> {
    fn operation_input(ctx: &mut GenContext, operation: &mut openapi::Operation) {
        Path::<T>::operation_input(ctx, operation);
    }
}

/// The generation-bearing path segments, whose parse failure answers `invalid-generation`.
///
/// [`Path`] with the rejection routed into the problem surface: a generation segment that is not
/// a sha256 generation id answers 400 with the parse failure as its detail, while a well-formed
/// id the process does not serve stays the handler's 404.
#[derive(Debug)]
pub(super) struct Generation<T>(pub(super) T);

impl<T, S> FromRequestParts<S> for Generation<T>
where
    T: DeserializeOwned + Send,
    S: Send + Sync,
{
    type Rejection = Problem<'static>;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        Path::<T>::from_request_parts(parts, state)
            .await
            .map(|Path(inner)| Self(inner))
            .map_err(|rejection| {
                Problem::new(
                    StatusCode::BAD_REQUEST,
                    ProblemType::InvalidGeneration,
                    rejection.body_text(),
                )
            })
    }
}

impl<T: JsonSchema> OperationInput for Generation<T> {
    fn operation_input(ctx: &mut GenContext, operation: &mut openapi::Operation) {
        Path::<T>::operation_input(ctx, operation);
    }
}

#[cfg(test)]
mod tests {
    use axum::{
        Router,
        body::{Body as RequestBody, to_bytes},
        extract::FromRequest as _,
        http::{Request, StatusCode, header},
        routing::{get, post},
    };
    use tower::ServiceExt as _;

    use super::{Body, Coordinates, Generation};

    /// A minimal operation body for the extraction tests.
    #[derive(Debug, PartialEq, Eq, serde::Deserialize, schemars::JsonSchema)]
    struct Subject {
        name: String,
    }

    fn json_request(body: &str) -> Request<RequestBody> {
        Request::builder()
            .method("POST")
            .header(header::CONTENT_TYPE, "application/json")
            .body(RequestBody::from(body.to_owned()))
            .expect("the request builds")
    }

    fn bare_request() -> Request<RequestBody> {
        Request::builder()
            .method("POST")
            .body(RequestBody::empty())
            .expect("the request builds")
    }

    async fn problem_json(problem: crate::api::problem::Problem<'static>) -> serde_json::Value {
        use axum::response::IntoResponse as _;

        let response = problem.into_response();
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("the problem body reads");
        serde_json::from_slice(&bytes).expect("the problem body is JSON")
    }

    #[tokio::test]
    async fn a_valid_body_extracts() {
        let Body(subject) = Body::<Subject>::from_request(json_request(r#"{"name": "n"}"#), &())
            .await
            .expect("a well-formed body extracts");

        assert_eq!(subject.name, "n");
    }

    #[tokio::test]
    async fn an_absent_body_answers_the_missing_body_problem() {
        let problem = Body::<Subject>::from_request(bare_request(), &())
            .await
            .expect_err("a required body must arrive");
        let document = problem_json(problem).await;

        assert_eq!(document["type"], "/problems/atlas/missing-body");
        assert_eq!(document["status"], 400);
    }

    #[tokio::test]
    async fn a_malformed_body_answers_the_invalid_body_problem() {
        let problem = Body::<Subject>::from_request(json_request("{ not json"), &())
            .await
            .expect_err("a malformed body must refuse");
        let document = problem_json(problem).await;

        assert_eq!(document["type"], "/problems/atlas/invalid-body");
        assert_eq!(document["status"], 400);
    }

    #[tokio::test]
    async fn a_mistyped_body_answers_the_invalid_body_problem() {
        // Well-formed JSON of the wrong shape: a data error, not a syntax error.
        let problem = Body::<Subject>::from_request(json_request(r#"{"name": 7}"#), &())
            .await
            .expect_err("a mistyped body must refuse");
        let document = problem_json(problem).await;

        assert_eq!(document["type"], "/problems/atlas/invalid-body");
        assert_eq!(document["status"], 422);
    }

    #[tokio::test]
    async fn an_optional_body_reads_absent_as_none_and_refuses_malformed() {
        use axum::extract::OptionalFromRequest;

        let absent = <Body<Subject> as OptionalFromRequest<()>>::from_request(bare_request(), &())
            .await
            .expect("an absent optional body extracts");
        assert!(absent.is_none(), "an absent body reads as None");

        let problem = <Body<Subject> as OptionalFromRequest<()>>::from_request(
            json_request("{ not json"),
            &(),
        )
        .await
        .expect_err("a present malformed body must refuse even when optional");
        let document = problem_json(problem).await;

        assert_eq!(document["type"], "/problems/atlas/invalid-body");
    }

    /// The tile-address shape: the numeric segments that can fail to parse.
    #[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
    struct Cell {
        z: u8,
        x: u32,
    }

    /// Routes a coordinate pair through a real router, where path extraction runs.
    async fn get_cell(uri: &str) -> (StatusCode, serde_json::Value) {
        let router: Router =
            Router::new().route(
                "/{z}/{x}",
                get(|Coordinates(cell): Coordinates<Cell>| async move {
                    format!("{}/{}", cell.z, cell.x)
                }),
            );
        let response = router
            .oneshot(
                Request::builder()
                    .uri(uri)
                    .body(RequestBody::empty())
                    .expect("the request builds"),
            )
            .await
            .expect("the router answers");
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("the response body reads");
        let value = serde_json::from_slice(&bytes)
            .unwrap_or_else(|_| serde_json::Value::String(String::from_utf8_lossy(&bytes).into()));
        (status, value)
    }

    #[tokio::test]
    async fn parsable_coordinates_extract() {
        let (status, body) = get_cell("/3/7").await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, serde_json::Value::String("3/7".to_owned()));
    }

    #[tokio::test]
    async fn unparsable_coordinates_answer_the_invalid_coordinate_problem() {
        let (status, document) = get_cell("/deep/7").await;

        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(document["type"], "/problems/atlas/invalid-coordinate");
        assert_eq!(document["status"], 400);
    }

    /// A generation-bearing path shape.
    #[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
    struct Layout {
        generation: crate::serve::GenerationId,
    }

    /// Routes a generation id through a real router, where path extraction runs.
    async fn get_layout(uri: &str) -> (StatusCode, serde_json::Value) {
        let router: Router =
            Router::new().route(
                "/{generation}",
                get(|Generation(layout): Generation<Layout>| async move {
                    layout.generation.to_string()
                }),
            );
        let response = router
            .oneshot(
                Request::builder()
                    .uri(uri)
                    .body(RequestBody::empty())
                    .expect("the request builds"),
            )
            .await
            .expect("the router answers");
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("the response body reads");
        let value = serde_json::from_slice(&bytes)
            .unwrap_or_else(|_| serde_json::Value::String(String::from_utf8_lossy(&bytes).into()));
        (status, value)
    }

    #[tokio::test]
    async fn a_well_formed_generation_id_extracts() {
        let id = "a".repeat(64);
        let (status, body) = get_layout(&format!("/{id}")).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, serde_json::Value::String(id));
    }

    #[tokio::test]
    async fn a_malformed_generation_id_answers_the_invalid_generation_problem() {
        let (status, document) = get_layout("/not-a-generation").await;

        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(document["type"], "/problems/atlas/invalid-generation");
        assert_eq!(document["status"], 400);
    }

    #[tokio::test]
    async fn a_wrong_content_type_answers_the_invalid_body_problem() {
        // The handler is irrelevant; the extractor refuses first.
        let router: Router = Router::new().route(
            "/subject",
            post(|Body(subject): Body<Subject>| async move { subject.name }),
        );
        let response = router
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/subject")
                    .header(header::CONTENT_TYPE, "text/plain")
                    .body(RequestBody::from("name=n"))
                    .expect("the request builds"),
            )
            .await
            .expect("the router answers");

        assert_eq!(response.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("the response body reads");
        let document: serde_json::Value =
            serde_json::from_slice(&bytes).expect("the rejection is a problem document");
        assert_eq!(document["type"], "/problems/atlas/invalid-body");
        assert_eq!(document["status"], 415);
    }
}
