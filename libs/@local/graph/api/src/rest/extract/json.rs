//! A JSON request body whose rejection is a problem details response.

use alloc::borrow::Cow;

use aide::{
    OperationInput, OperationOutput as _,
    generate::GenContext,
    openapi::{Operation, ReferenceOr},
};
use axum::extract::{FromRequest, Request, rejection::JsonRejection};
use hash_middleware::problem::InternalServerError;
use http::StatusCode;
use problematic::{Answer, Expose, Problem, ProblemType, ProblemVariant, Rejection, Variant};
use schemars::JsonSchema;
use serde::{Serialize, de::DeserializeOwned};

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
}

/// The request does not declare its body as `application/json`.
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
}

/// The request body is well-formed JSON of a shape the operation does not accept.
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
}

/// The ways [`Json`] refuses a request body.
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
            Self::BytesRejection(rejection)
                if rejection.status() == StatusCode::PAYLOAD_TOO_LARGE =>
            {
                Answer::new(BodyTooLarge { detail })
            }
            Self::BytesRejection(_) => Answer::new(UnreadableBody { detail }),
            _ => {
                // `JsonRejection` is not exhaustive: a rejection added upstream lands here until
                // it is named above.
                tracing::warn!(status = %self.status(), %detail, "the JSON body was refused in a way this extractor does not name");
                if self.status().is_server_error() {
                    Answer::new(InternalServerError)
                } else {
                    Answer::new(UnreadableBody { detail })
                }
            }
        }
    }
}

/// A JSON request body whose rejection is a problem details response.
pub(in crate::rest) struct Json<T>(pub T);

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
    }
}
