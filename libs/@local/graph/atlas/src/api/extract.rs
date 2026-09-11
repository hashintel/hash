//! Extractors whose rejections are problem documents.
//!
//! The framework's own extractors answer plain-text rejections. These extractors return
//! domain-specific problem documents and describe their accepted inputs in OpenAPI.
//!
//! [`Body`] answers `missing-body` for an absent required body and `invalid-body` for an invalid
//! JSON body. [`Coordinates`] answers `invalid-coordinate` for an unparsable `z/x/y` segment.
//!
//! [`Generation`] captures an [`Observation`] of the requested generation. [`Variant`] adds
//! fitted-variant validation. Authorization and response assembly use that captured publication.

#![expect(
    clippy::field_scoped_visibility_modifiers,
    reason = "handlers in sibling modules destructure the wrappers - the axum extractor pattern - \
              and pub(super) is the narrowest visibility that permits it"
)]

use aide::{OperationInput, generate::GenContext, openapi};
use axum::{
    Json, RequestPartsExt as _,
    extract::{
        FromRequest, FromRequestParts, OptionalFromRequest, Path, Request,
        rejection::{JsonRejection, PathRejection},
    },
    http::{StatusCode, request::Parts},
};
use schemars::JsonSchema;
use serde::de::DeserializeOwned;

use super::{
    AppState,
    problem::{self, Problem, ProblemType},
    tile::CellPath,
};
use crate::{file::generation::GenerationId, serve::runtime::registry::Observation};

/// A JSON request body whose rejections are problem documents.
///
/// A request without a body
/// answers `missing-body` when the operation requires one, and `Option<Body<T>>` reads an absent
/// body as `None`. A present body that is not the operation's JSON - whether wrong content type,
/// syntax error, shape mismatch, or oversize - answers `invalid-body` with the framework's parse
/// failure as its detail and status. The detail is a request echo, never server state.
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
/// Preserves the framework's status (400 for a syntax error, 415 for a wrong content type, 413 for
/// an oversize body) and uses its message as detail. Parse positions and expected shapes are
/// client-safe request echoes.
fn invalid_body(rejection: &JsonRejection) -> Problem<'static> {
    Problem::new(
        rejection.status(),
        ProblemType::InvalidBody,
        rejection.body_text(),
    )
}

fn invalid_generation(rejection: &PathRejection) -> Problem<'static> {
    Problem::new(
        StatusCode::BAD_REQUEST,
        ProblemType::InvalidGeneration,
        rejection.body_text(),
    )
}

#[derive(serde::Deserialize, schemars::JsonSchema)]
struct RequestedGeneration {
    /// The sha256 generation id, as returned by `current`.
    generation: GenerationId,
}

/// The captured publication requested by a generation path.
///
/// A malformed generation id answers `invalid-generation`. A well-formed id outside the registry's
/// served generations answers `unknown-generation` once a current publication is available.
pub(super) struct Generation {
    pub(super) observation: Observation,
}

impl<R: Send> FromRequestParts<AppState<R>> for Generation {
    type Rejection = Problem<'static>;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState<R>,
    ) -> Result<Self, Self::Rejection> {
        let Path(RequestedGeneration { generation }) = parts
            .extract_with_state::<Path<RequestedGeneration>, _>(state)
            .await
            .map_err(|rejection| invalid_generation(&rejection))?;

        let observation = state.registry.observe(Some(generation))?;
        Ok(Self { observation })
    }
}

impl OperationInput for Generation {
    fn operation_input(ctx: &mut GenContext, operation: &mut openapi::Operation) {
        Path::<RequestedGeneration>::operation_input(ctx, operation);
    }
}

#[derive(serde::Deserialize, schemars::JsonSchema)]
struct VariantData {
    /// The fitted variant name listed in the manifest.
    variant: String,
}

/// A captured generation publication with a supported fitted variant.
///
/// Extraction retains the [`Generation`]'s observation and rejects an unsupported variant as
/// `unknown-variant`.
pub(super) struct Variant {
    pub(super) observation: Observation,
}

impl<R: Send> FromRequestParts<AppState<R>> for Variant {
    type Rejection = Problem<'static>;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState<R>,
    ) -> Result<Self, Self::Rejection> {
        let Generation { observation } = parts.extract_with_state::<Generation, _>(state).await?;
        let Path(VariantData { variant }) = parts
            .extract_with_state::<Path<VariantData>, _>(state)
            .await
            .map_err(|rejection| invalid_generation(&rejection))?;

        problem::reject_variant(&variant)?;

        Ok(Self { observation })
    }
}

impl OperationInput for Variant {
    fn operation_input(ctx: &mut GenContext, operation: &mut openapi::Operation) {
        Generation::operation_input(ctx, operation);
        Path::<VariantData>::operation_input(ctx, operation);
    }
}

/// The numeric tile-address segments, whose parse failure answers `invalid-coordinate`.
///
/// Parse failures retain the framework's detail in the problem document.
#[derive(Debug)]
pub(super) struct Coordinates(pub(super) CellPath);

impl<S> FromRequestParts<S> for Coordinates
where
    S: Send + Sync,
{
    type Rejection = Problem<'static>;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        Path::<CellPath>::from_request_parts(parts, state)
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

impl OperationInput for Coordinates {
    fn operation_input(ctx: &mut GenContext, operation: &mut openapi::Operation) {
        Path::<CellPath>::operation_input(ctx, operation);
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

    use super::{Body, Coordinates};

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
    async fn body_valid() {
        let Body(subject) = Body::<Subject>::from_request(json_request(r#"{"name": "n"}"#), &())
            .await
            .expect("a well-formed body extracts");

        assert_eq!(subject.name, "n");
    }

    #[tokio::test]
    async fn body_absent() {
        let problem = Body::<Subject>::from_request(bare_request(), &())
            .await
            .expect_err("a required body must arrive");
        let document = problem_json(problem).await;

        assert_eq!(document["type"], "/problems/atlas/missing-body");
        assert_eq!(document["status"], 400);
    }

    #[tokio::test]
    async fn body_malformed() {
        let problem = Body::<Subject>::from_request(json_request("{ not json"), &())
            .await
            .expect_err("a malformed body must refuse");
        let document = problem_json(problem).await;

        assert_eq!(document["type"], "/problems/atlas/invalid-body");
        assert_eq!(document["status"], 400);
    }

    #[tokio::test]
    async fn body_mistyped() {
        // Well-formed JSON of the wrong shape reads as a data error (422) rather than a syntax
        // error (400).
        let problem = Body::<Subject>::from_request(json_request(r#"{"name": 7}"#), &())
            .await
            .expect_err("a mistyped body must refuse");
        let document = problem_json(problem).await;

        assert_eq!(document["type"], "/problems/atlas/invalid-body");
        assert_eq!(document["status"], 422);
    }

    #[tokio::test]
    async fn body_optional() {
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

    async fn get_cell(uri: &str) -> (StatusCode, serde_json::Value) {
        let router: Router = Router::new().route(
            "/{generation}/{variant}/{z}/{x}/{y}",
            get(|_: Coordinates| async { "accepted" }),
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
    async fn coordinates_valid() {
        let (status, body) = get_cell("/generation/plain/3/7/1").await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, serde_json::Value::String("accepted".to_owned()));
    }

    #[tokio::test]
    async fn coordinates_malformed() {
        let (status, document) = get_cell("/generation/plain/deep/7/1").await;

        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(document["type"], "/problems/atlas/invalid-coordinate");
        assert_eq!(document["status"], 400);
    }

    #[tokio::test]
    async fn body_wrong_content_type() {
        // The handler is irrelevant because the extractor refuses first.
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
