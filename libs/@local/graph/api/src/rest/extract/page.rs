//! A JSON response that names the next page in a `Link` header.

use aide::{
    OperationOutput,
    generate::GenContext,
    openapi::{self, Header, HeaderStyle, Operation, ParameterSchemaOrContent, ReferenceOr},
};
use axum::response::{IntoResponse, Response};
use http::{
    HeaderValue,
    header::{InvalidHeaderValue, LINK},
};
use indexmap::IndexMap;
use schemars::JsonSchema;
use serde::Serialize;

use super::Json;

/// The `Link` header value that names the next page (RFC 8288).
#[derive(Debug)]
pub(in crate::rest) struct NextPage(HeaderValue);

impl NextPage {
    /// The next page at the URI reference `uri`, which resolves against the URL of the request.
    ///
    /// # Errors
    ///
    /// Returns an error if `uri` contains a character a header value cannot hold.
    pub(in crate::rest) fn new(uri: &str) -> Result<Self, InvalidHeaderValue> {
        HeaderValue::try_from(format!("<{uri}>; rel=\"next\"")).map(Self)
    }
}

/// A page of a JSON response, which names the next page, if any, in a `Link` header.
pub(in crate::rest) struct Page<T> {
    body: Json<T>,
    next: Option<NextPage>,
}

impl<T> Page<T> {
    /// A page answering with `body`, followed by `next`, or the last page with [`None`].
    pub(in crate::rest) const fn new(body: T, next: Option<NextPage>) -> Self {
        Self {
            body: Json(body),
            next,
        }
    }
}

impl<T: Serialize> IntoResponse for Page<T> {
    fn into_response(self) -> Response {
        let mut response = self.body.into_response();
        // A body that fails to serialize is answered with a problem, which names no next page.
        if response.status().is_success()
            && let Some(NextPage(next)) = self.next
        {
            response.headers_mut().insert(LINK, next);
        }
        response
    }
}

/// The documentation of the `Link` header that names the next page.
fn next_page_link() -> Header {
    Header {
        description: Some(
            "Names the next page as `<URI>; rel=\"next\"` (RFC 8288). The URI is relative and \
             resolves against the URL of this request. Repeat the request there, with the same \
             body if it has one. The last page has no `Link` header."
                .to_owned(),
        ),
        style: HeaderStyle::Simple,
        required: false,
        deprecated: None,
        format: ParameterSchemaOrContent::Schema(openapi::SchemaObject {
            json_schema: schemars::json_schema!({ "type": "string" }),
            external_docs: None,
            example: None,
        }),
        example: Some(serde_json::Value::from("<?cursor=...>; rel=\"next\"")),
        examples: IndexMap::default(),
        extensions: IndexMap::default(),
    }
}

impl<T: JsonSchema> OperationOutput for Page<T> {
    type Inner = T;

    fn operation_response(
        ctx: &mut GenContext,
        operation: &mut Operation,
    ) -> Option<openapi::Response> {
        let mut response = Json::<T>::operation_response(ctx, operation)?;
        response
            .headers
            .insert("Link".to_owned(), ReferenceOr::Item(next_page_link()));
        Some(response)
    }

    fn inferred_responses(
        ctx: &mut GenContext,
        operation: &mut Operation,
    ) -> Vec<(Option<openapi::StatusCode>, openapi::Response)> {
        Self::operation_response(ctx, operation)
            .map(|response| (Some(openapi::StatusCode::Code(200)), response))
            .into_iter()
            .collect()
    }
}
