//! A JSON request or response body whose failures are problem details responses.

use alloc::borrow::Cow;

use aide::{
    OperationInput, OperationOutput,
    generate::GenContext,
    openapi::{self, Operation, ReferenceOr},
};
use axum::{
    extract::{
        FromRequest, Request,
        rejection::{BytesRejection, FailedToBufferBody, JsonRejection},
    },
    response::{IntoResponse, Response},
};
use hash_middleware::problem::InternalServerError;
use http::{HeaderValue, StatusCode, header::CONTENT_TYPE};
use problematic::{Answer, Expose, Problem, ProblemType, ProblemVariant, Rejection, Variant};
use schemars::JsonSchema;
use serde::{Serialize, de::DeserializeOwned};

use super::MessagePart;

/// The request body is not valid JSON.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("{detail}")]
struct MalformedJson {
    #[serde(skip)]
    detail: String,
}

impl ProblemVariant for MalformedJson {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Bad Request"),
        status: StatusCode::BAD_REQUEST,
    };

    fn example() -> Option<Self> {
        axum::Json::<serde_json::Value>::from_bytes(b"{")
            .err()
            .map(|rejection| Self {
                detail: rejection.body_text(),
            })
    }
}

/// The request body could not be read to its end.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("{detail}")]
struct UnreadableBody {
    #[serde(skip)]
    detail: String,
}

impl ProblemVariant for UnreadableBody {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Bad Request"),
        status: StatusCode::BAD_REQUEST,
    };

    fn example() -> Option<Self> {
        Some(Self {
            detail: "Failed to buffer the request body: error reading a body from connection"
                .to_owned(),
        })
    }
}

/// The request body is larger than the operation accepts.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("{detail}")]
struct BodyTooLarge {
    #[serde(skip)]
    detail: String,
}

impl ProblemVariant for BodyTooLarge {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Content Too Large"),
        status: StatusCode::PAYLOAD_TOO_LARGE,
    };

    fn example() -> Option<Self> {
        Some(Self {
            detail: "Failed to buffer the request body: length limit exceeded".to_owned(),
        })
    }
}

/// The request's `Content-Type` is missing or neither `application/json` nor `application/*+json`.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("{detail}")]
struct UnsupportedMediaType {
    #[serde(skip)]
    detail: String,
}

impl ProblemVariant for UnsupportedMediaType {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Unsupported Media Type"),
        status: StatusCode::UNSUPPORTED_MEDIA_TYPE,
    };

    fn example() -> Option<Self> {
        Some(Self {
            detail: "Expected request with `Content-Type: application/json`".to_owned(),
        })
    }
}

/// The request body does not match the schema of the operation.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("{detail}")]
struct InvalidBody {
    #[serde(skip)]
    detail: String,
}

impl ProblemVariant for InvalidBody {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Unprocessable Content"),
        status: StatusCode::UNPROCESSABLE_ENTITY,
    };

    fn example() -> Option<Self> {
        axum::Json::<u8>::from_bytes(br#""many""#)
            .err()
            .map(|rejection| Self {
                detail: rejection.body_text(),
            })
    }
}

/// The ways [`Json`] rejects a request body.
pub(in crate::rest) struct JsonProblem;

impl Problem for JsonProblem {
    const VARIANTS: &'static [Variant] = &[
        Variant::of::<MalformedJson>(),
        Variant::of::<UnreadableBody>(),
        Variant::of::<BodyTooLarge>(),
        Variant::of::<UnsupportedMediaType>(),
        Variant::of::<InvalidBody>(),
        Variant::of::<InternalServerError>(),
    ];
}

impl Expose<JsonProblem> for JsonRejection {
    fn expose(&self) -> Answer<'_, JsonProblem> {
        let detail = self.body_text();
        match self {
            Self::JsonSyntaxError(_) => Answer::new(MalformedJson { detail }),
            Self::JsonDataError(_) => Answer::new(InvalidBody { detail }),
            Self::MissingJsonContentType(_) => Answer::new(UnsupportedMediaType { detail }),
            Self::BytesRejection(BytesRejection::FailedToBufferBody(
                FailedToBufferBody::LengthLimitError(_),
            )) => Answer::new(BodyTooLarge { detail }),
            Self::BytesRejection(BytesRejection::FailedToBufferBody(
                FailedToBufferBody::UnknownBodyError(_),
            )) => Answer::new(UnreadableBody { detail }),
            // `JsonRejection` and the rejections it wraps are `#[non_exhaustive]`: these arms
            // handle a rejection a later axum version adds until an arm above names it.
            Self::BytesRejection(_) | _ if self.status().is_server_error() => {
                tracing::error!(status = %self.status(), %detail, "axum rejected the JSON body in a way this extractor does not name");
                Answer::new(InternalServerError)
            }
            Self::BytesRejection(_) | _ => {
                tracing::warn!(status = %self.status(), %detail, "axum rejected the JSON body in a way this extractor does not name");
                Answer::new(UnreadableBody { detail })
            }
        }
    }
}

/// The way [`Json`] fails to answer.
struct JsonResponseProblem;

impl Problem for JsonResponseProblem {
    const VARIANTS: &'static [Variant] = &[Variant::of::<InternalServerError>()];
}

impl Expose<JsonResponseProblem> for serde_json::Error {
    fn expose(&self) -> Answer<'_, JsonResponseProblem> {
        Answer::new(InternalServerError)
    }
}

/// The status for `status` if it is a success status that carries content.
pub(super) const fn content_status(status: u16) -> Option<StatusCode> {
    match status {
        204 | 205 => None,
        200..=299 => match StatusCode::from_u16(status) {
            Ok(status) => Some(status),
            Err(_) => None,
        },
        _ => None,
    }
}

/// A JSON request or response body whose failures are problem details responses.
///
/// As a request body, it rejects a request with problem details. As a response body, it answers
/// with `STATUS`, a success status that carries content, and answers a body that fails to serialize
/// with [`InternalServerError`]. A status set through a tuple would replace the status of that
/// answer, so a response states its status in its type.
pub(in crate::rest) struct Json<T, const STATUS: u16 = 200>(pub T);

impl<T, S> FromRequest<S> for Json<T>
where
    T: DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = Rejection<JsonProblem>;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        let axum::Json(body) = axum::Json::<T>::from_request(req, state).await?;
        Ok(Self(body))
    }
}

impl<T: JsonSchema> OperationInput for Json<T> {
    fn operation_input(ctx: &mut GenContext, operation: &mut Operation) {
        axum::Json::<T>::operation_input(ctx, operation);
        // Aide copies the description of the body's schema onto the body, and documentation
        // viewers show both.
        if let Some(ReferenceOr::Item(body)) = &mut operation.request_body {
            body.description = None;
        }
        // Documents the variants on the operation itself, so there are no responses to infer.
        Rejection::<JsonProblem>::inferred_responses(ctx, operation);
        MessagePart::RequestBody.mark(operation);
    }
}

impl<T: Serialize, const STATUS: u16> IntoResponse for Json<T, STATUS> {
    fn into_response(self) -> Response {
        let status = const {
            content_status(STATUS)
                .expect("a JSON response should have a success status that carries content")
        };
        match serde_json::to_vec(&self.0) {
            Ok(body) => (
                status,
                [(CONTENT_TYPE, HeaderValue::from_static("application/json"))],
                body,
            )
                .into_response(),
            Err(error) => {
                tracing::error!(%error, body = core::any::type_name::<T>(), "the response body failed to serialize");
                Rejection::<JsonResponseProblem>::from(error).into_response()
            }
        }
    }
}

impl<T: JsonSchema, const STATUS: u16> OperationOutput for Json<T, STATUS> {
    type Inner = T;

    fn operation_response(
        ctx: &mut GenContext,
        operation: &mut Operation,
    ) -> Option<openapi::Response> {
        // Documents the answer to a body that fails to serialize on the operation itself.
        Rejection::<JsonResponseProblem>::inferred_responses(ctx, operation);
        MessagePart::ResponseBody.mark(operation);
        axum::Json::<T>::operation_response(ctx, operation)
    }

    fn inferred_responses(
        ctx: &mut GenContext,
        operation: &mut Operation,
    ) -> Vec<(Option<openapi::StatusCode>, openapi::Response)> {
        let status = const {
            content_status(STATUS)
                .expect("a JSON response should have a success status that carries content")
                .as_u16()
        };
        Self::operation_response(ctx, operation)
            .map(|response| (Some(openapi::StatusCode::Code(status)), response))
            .into_iter()
            .collect()
    }
}
