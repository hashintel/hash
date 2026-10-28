//! `POST /query`: the entities a query matches, a page at a time.
#![expect(
    clippy::empty_enums,
    reason = "serde's derive declares an enum of the fields `QueryEntitiesRequest` accepts, which \
              has none yet"
)]

mod cursor;

use alloc::borrow::Cow;
use core::error::Error;

use aide::{
    openapi::{
        Header, HeaderStyle, ParameterSchemaOrContent, ReferenceOr, SchemaObject, StatusCode,
    },
    transform::TransformOperation,
};
use error_stack::Report;
use hash_graph_store::pool::StorePool;
use indexmap::IndexMap;
use problematic::{Answer, Expose, Problem, ProblemType, ProblemVariant, Rejection, Variant};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use self::cursor::Cursor;
use super::entity::Entity;
use crate::rest::{
    ApiState,
    credentials::Actor,
    extract::{Json, Query},
    public::{Credentials, present::present},
    routing::{self, Route},
};

/// The query.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[expect(
    clippy::empty_structs_with_brackets,
    reason = "serde reads a struct with braces from a JSON object, and a unit struct from `null`"
)]
struct QueryEntitiesRequest {}

/// The page of the query to answer.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QueryEntitiesParameters {
    /// The page to return, as the previous page's `Link` header names it. Defaults to the first.
    #[serde(default, deserialize_with = "present")]
    #[cfg_attr(
        not(test),
        expect(dead_code, reason = "the query is not implemented yet")
    )]
    cursor: Option<Cursor>,
}

/// A page of the entities the query matches.
#[derive(Serialize, JsonSchema)]
struct QueryEntitiesResponse {
    /// The entities on this page.
    entities: Vec<Entity>,
}

/// The server does not answer the query yet.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("Querying entities is not implemented yet.")]
struct NotImplemented;

impl ProblemVariant for NotImplemented {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Not Implemented"),
        status: http::StatusCode::NOT_IMPLEMENTED,
    };

    fn example() -> Option<Self> {
        Some(Self)
    }
}

/// The ways [`query_entities`] refuses a request its extractors accept.
struct QueryEntitiesProblem;

impl Problem for QueryEntitiesProblem {
    const VARIANTS: &'static [Variant] = &[Variant::of::<NotImplemented>()];
}

#[derive(Debug, derive_more::Display)]
enum QueryEntitiesError {
    #[display("querying entities is not implemented")]
    NotImplemented,
}

impl Error for QueryEntitiesError {}

impl Expose<QueryEntitiesProblem> for Report<QueryEntitiesError> {
    fn expose(&self) -> Answer<'_, QueryEntitiesProblem> {
        match self.current_context() {
            QueryEntitiesError::NotImplemented => Answer::new(NotImplemented),
        }
    }
}

async fn query_entities(
    _actor: Actor<Credentials>,
    Query(_parameters): Query<QueryEntitiesParameters>,
    Json(QueryEntitiesRequest {}): Json<QueryEntitiesRequest>,
) -> Result<Json<QueryEntitiesResponse>, Rejection<QueryEntitiesProblem>> {
    Err(Report::new(QueryEntitiesError::NotImplemented).into())
}

/// The documentation of the `Link` header that names the next page.
fn next_page_link() -> Header {
    Header {
        description: Some(
            "Names the next page as `<URI>; rel=\"next\"` (RFC 8288). A relative URI resolves \
             against the URL of this request. Send the same body to it. The last page has no \
             `Link` header."
                .to_owned(),
        ),
        style: HeaderStyle::Simple,
        required: false,
        deprecated: None,
        format: ParameterSchemaOrContent::Schema(SchemaObject {
            json_schema: schemars::json_schema!({ "type": "string" }),
            external_docs: None,
            example: None,
        }),
        example: Some(serde_json::Value::from(
            "</entities/v1/query?cursor=AbCd1234>; rel=\"next\"",
        )),
        examples: IndexMap::default(),
        extensions: IndexMap::default(),
    }
}

fn document_query_entities(mut operation: TransformOperation<'_>) -> TransformOperation<'_> {
    let Some(ReferenceOr::Item(page)) = operation
        .inner_mut()
        .responses
        .as_mut()
        .and_then(|responses| responses.responses.get_mut(&StatusCode::Code(200)))
    else {
        panic!("the operation should document its 200 response");
    };
    page.headers
        .insert("Link".to_owned(), ReferenceOr::Item(next_page_link()));

    operation
        .id("queryEntities")
        .summary("Query entities")
        .description(
            "Returns the entities the query matches, a page at a time. The server chooses the \
             size of a page, and the `Link` header names the next one. Not implemented yet: \
             answers 501.",
        )
}

pub(super) fn route<S>() -> Route<ApiState<S>>
where
    S: StorePool + Send + Sync + 'static,
{
    routing::post(query_entities, document_query_entities)
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use axum_extra::extract::Query;

    use super::QueryEntitiesParameters;

    fn parse(uri: &str) -> Result<QueryEntitiesParameters, String> {
        let uri = uri.parse().expect("the URI should be valid");
        Query::try_from_uri(&uri)
            .map(|Query(parameters)| parameters)
            .map_err(|rejection| rejection.to_string())
    }

    #[test]
    fn parameters_no_cursor() {
        assert_matches!(
            parse("/entities/v1/query"),
            Ok(QueryEntitiesParameters { cursor: None })
        );
    }

    #[test]
    fn parameters_empty_cursor() {
        for uri in ["/entities/v1/query?cursor=", "/entities/v1/query?cursor"] {
            assert_matches!(
                parse(uri),
                Err(rejection) if rejection.contains("the cursor is empty"),
                "`{uri}` should be rejected"
            );
        }
    }
}
