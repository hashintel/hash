//! `POST /query`: the entities a query matches, a page at a time.

mod cursor;
mod filter;

use alloc::borrow::Cow;
use core::{error::Error, fmt::Write as _, num::NonZero};

use aide::transform::TransformOperation;
use axum::extract::State;
use error_stack::{Report, ResultExt as _};
use hash_codec::serde::non_null;
use hash_graph_store::{
    entity::{EntityQueryPath, EntityStore as _, QueryEntitiesParams},
    filter::{Filter, FilterExpression, Parameter},
    pool::StorePool,
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_middleware::problem::{InternalServerError, ServiceUnavailable};
use http::StatusCode;
use problematic::{Answer, Expose, Problem, ProblemType, ProblemVariant, Rejection, Variant};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use type_system::{
    knowledge::{
        self,
        entity::{EntityId, id::EntityUuid},
    },
    principal::actor::ActorId,
};

use self::{
    cursor::Cursor,
    filter::{EntityFilter, FilterError, MAX_CONDITIONS},
};
use super::entity::{Entity, LiveEntityId};
use crate::rest::{
    ApiState,
    credentials::Actor,
    extract::{Json, NextPage, Page, Query},
    public::Credentials,
    routing::{self, Route},
};

/// The query.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QueryEntitiesRequest {
    /// The condition the entities meet.
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(
        with = "EntityFilter",
        extend("description" = format!(
            "The condition the entities meet, with at most {MAX_CONDITIONS} `eq`, `in` and `has` \
             in all."
        ))
    )]
    filter: Option<EntityFilter>,
}

/// The page of the query to answer.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QueryEntitiesParameters {
    /// The page to return, as the previous page's `Link` header names it. Defaults to the first.
    #[serde(default, deserialize_with = "non_null")]
    cursor: Option<Cursor>,
    /// The size of the page; the server's maximum is the default and caps larger values.
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "NonZero<usize>")]
    limit: Option<NonZero<usize>>,
}

/// A page of the entities the query matches.
#[derive(Serialize, JsonSchema)]
struct QueryEntitiesResponse {
    /// The entities on this page.
    entities: Vec<Entity>,
}

/// The filter has an empty `in`, `and` or `or`, or names more values or conditions than allowed.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The filter is invalid: {error}.")]
struct InvalidFilter {
    #[serde(skip)]
    error: FilterError,
}

impl ProblemVariant for InvalidFilter {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Unprocessable Content"),
        status: StatusCode::UNPROCESSABLE_ENTITY,
    };

    fn example() -> Option<Self> {
        Some(Self {
            error: FilterError::TooManyConditions(MAX_CONDITIONS + 1),
        })
    }
}

/// The ways [`query_entities`] refuses a request its extractors accept.
struct QueryEntitiesProblem;

impl Problem for QueryEntitiesProblem {
    const VARIANTS: &'static [Variant] = &[
        Variant::of::<InvalidFilter>(),
        Variant::of::<ServiceUnavailable>(),
        Variant::of::<InternalServerError>(),
    ];
}

#[derive(Debug, derive_more::Display)]
enum QueryEntitiesError {
    #[display("no store could be acquired")]
    Unavailable,
    #[display("the store could not be read")]
    Store,
    #[display("the store returned the draft `{_0}`")]
    Draft(EntityId),
    #[display("the link to the next page is not a valid header value")]
    NextPage,
}

impl Error for QueryEntitiesError {}

impl Expose<QueryEntitiesProblem> for FilterError {
    fn expose(&self) -> Answer<'_, QueryEntitiesProblem> {
        Answer::new(InvalidFilter { error: *self })
    }
}

impl Expose<QueryEntitiesProblem> for Report<QueryEntitiesError> {
    fn expose(&self) -> Answer<'_, QueryEntitiesProblem> {
        match self.current_context() {
            QueryEntitiesError::Unavailable => Answer::new(ServiceUnavailable),
            QueryEntitiesError::Store
            | QueryEntitiesError::Draft(_)
            | QueryEntitiesError::NextPage => Answer::new(InternalServerError),
        }
    }
}

fn page_size(limit: Option<NonZero<usize>>, maximum: NonZero<usize>) -> NonZero<usize> {
    limit.map_or(maximum, |limit| limit.min(maximum))
}

/// Splits what a query read into the page and the position after it, if another page follows.
///
/// `entities` has to be read with a limit of `page_size` + 1; another page follows exactly when
/// it holds more than `page_size`.
fn split_page<T>(
    mut entities: Vec<T>,
    page_size: NonZero<usize>,
    entity_uuid: impl FnOnce(&T) -> EntityUuid,
) -> (Vec<T>, Option<Cursor>) {
    if entities.len() <= page_size.get() {
        return (entities, None);
    }
    entities.truncate(page_size.get());
    let next = entities
        .last()
        .map(|entity| Cursor::after(entity_uuid(entity)));
    (entities, next)
}

/// The URI reference of the page after `cursor`, keeping the `limit` the request gave.
///
/// It names only the query, so it resolves against the path the request was sent to.
fn next_page_uri(cursor: Cursor, limit: Option<NonZero<usize>>) -> String {
    let mut uri = format!("?cursor={cursor}");
    if let Some(limit) = limit {
        write!(uri, "&limit={limit}").expect("writing to a string should not fail");
    }
    uri
}

/// The store filter for `filter`, limited to entities that are not archived.
fn store_filter(filter: Option<&EntityFilter>) -> Filter<'_, knowledge::Entity> {
    let not_archived = Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::Archived,
        },
        FilterExpression::Parameter {
            parameter: Parameter::Boolean(false),
            convert: None,
        },
    );
    match filter {
        Some(filter) => Filter::All(vec![not_archived, filter.to_store_filter()]),
        None => not_archived,
    }
}

/// The store query for a page of `page_size` entities after `cursor`.
///
/// It reads one entity more than the page holds, which [`split_page`] needs to tell whether
/// another page follows.
fn query_params(
    filter: Option<&EntityFilter>,
    cursor: Option<Cursor>,
    page_size: NonZero<usize>,
) -> QueryEntitiesParams<'_> {
    QueryEntitiesParams {
        filter: store_filter(filter),
        temporal_axes: QueryTemporalAxesUnresolved::live_only(),
        sorting: Cursor::sorting(cursor),
        conversions: Vec::new(),
        limit: page_size.get().saturating_add(1),
        include_drafts: false,
        include_entity_types: None,
        include_permissions: false,
    }
}

async fn query_entities<S>(
    State(state): State<ApiState<S>>,
    actor: Actor<Credentials>,
    Query(QueryEntitiesParameters { cursor, limit }): Query<QueryEntitiesParameters>,
    Json(QueryEntitiesRequest { filter }): Json<QueryEntitiesRequest>,
) -> Result<Page<QueryEntitiesResponse>, Rejection<QueryEntitiesProblem>>
where
    S: StorePool + Send + Sync + 'static,
{
    if let Some(filter) = &filter {
        filter.validate()?;
    }

    let page_size = page_size(
        limit,
        NonZero::<usize>::from(state.public_api_config().query_entity_limit),
    );

    let mut store = state
        .acquire()
        .await
        .change_context(QueryEntitiesError::Unavailable)?;
    let entities = store
        .query_entities(
            Some(ActorId::from(actor)),
            query_params(filter.as_ref(), cursor, page_size),
        )
        .await
        .change_context(QueryEntitiesError::Store)?
        .entities;

    let (entities, next) = split_page(entities, page_size, |entity| {
        entity.metadata.record_id.entity_id.entity_uuid
    });
    let next = next
        .map(|cursor| {
            NextPage::new(&next_page_uri(cursor, limit))
                .change_context(QueryEntitiesError::NextPage)
        })
        .transpose()?;

    let entities = entities
        .into_iter()
        .map(|entity| {
            let entity_id = entity.metadata.record_id.entity_id;
            let entity_id = LiveEntityId::try_from(entity_id).map_err(|error| {
                Report::new(error).change_context(QueryEntitiesError::Draft(entity_id))
            })?;
            Ok(Entity::new(entity_id, entity))
        })
        .collect::<Result<Vec<_>, Report<QueryEntitiesError>>>()?;

    Ok(Page::new(QueryEntitiesResponse { entities }, next))
}

fn document_query_entities(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("queryEntities")
        .summary("Query entities")
        .description(
            "Returns the current edition of each entity the caller may view that is not archived \
             and meets `filter`, if given, a page at a time, in a stable order. The `Link` header \
             names the next page.",
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
    use core::{assert_matches, num::NonZero};

    use axum_extra::extract::Query;
    use hash_graph_store::{
        entity::EntityQueryPath,
        filter::{Filter, FilterExpression, Parameter},
        subgraph::temporal_axes::QueryTemporalAxesUnresolved,
    };
    use serde::de::{Error as _, Unexpected};
    use serde_json::json;
    use type_system::knowledge::{self, entity::id::EntityUuid};
    use uuid::Uuid;

    use super::{
        Cursor, EntityFilter, QueryEntitiesParameters, QueryEntitiesRequest,
        filter::SingleKeyVisitor, next_page_uri, page_size, query_params, split_page, store_filter,
    };

    fn parse(uri: &str) -> Result<QueryEntitiesParameters, String> {
        let uri = uri.parse().expect("the URI should be valid");
        Query::try_from_uri(&uri)
            .map(|Query(parameters)| parameters)
            .map_err(|rejection| rejection.to_string())
    }

    fn size(size: usize) -> NonZero<usize> {
        NonZero::new(size).expect("the size should not be zero")
    }

    fn not_archived<'p>() -> Filter<'p, knowledge::Entity> {
        Filter::Equal(
            FilterExpression::Path {
                path: EntityQueryPath::Archived,
            },
            FilterExpression::Parameter {
                parameter: Parameter::Boolean(false),
                convert: None,
            },
        )
    }

    #[test]
    fn parameters_none() {
        assert_matches!(
            parse("/entities/v1/query"),
            Ok(QueryEntitiesParameters {
                cursor: None,
                limit: None
            })
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

    #[test]
    fn request_filter_null() {
        assert_eq!(
            serde_json::from_value::<QueryEntitiesRequest>(json!({ "filter": null }))
                .expect_err("a `null` filter should be rejected")
                .to_string(),
            serde_json::Error::invalid_type(
                Unexpected::Unit,
                &SingleKeyVisitor::<EntityFilter>::new()
            )
            .to_string()
        );
    }

    #[test]
    fn store_filter_none() {
        assert_eq!(
            store_filter(None),
            not_archived(),
            "a query without a filter should still leave out archived entities"
        );
    }

    #[test]
    fn store_filter_some() {
        let filter: EntityFilter = serde_json::from_value(
            json!({ "webId": { "eq": "8d86c8c3-d66d-43d1-859b-676c3bcaeadc" } }),
        )
        .expect("should be a filter");
        assert_eq!(
            store_filter(Some(&filter)),
            Filter::All(vec![not_archived(), filter.to_store_filter()]),
            "the filter should apply to entities that are not archived"
        );
    }

    #[test]
    fn query_params_page() {
        let params = query_params(None, None, size(20));
        assert_eq!(
            params.limit, 21,
            "the query should read one entity more than the page holds"
        );
        assert!(!params.include_drafts, "the query should read no drafts");
        assert_eq!(
            params.temporal_axes,
            QueryTemporalAxesUnresolved::live_only(),
            "the query should read the current editions"
        );
        assert_eq!(
            params.filter,
            store_filter(None),
            "the query should leave out archived entities"
        );
    }

    #[test]
    fn page_size_limit() {
        assert_eq!(
            page_size(None, size(100)),
            size(100),
            "the maximum should be the default"
        );
        assert_eq!(
            page_size(Some(size(20)), size(100)),
            size(20),
            "a smaller limit should be kept"
        );
        assert_eq!(
            page_size(Some(size(500)), size(100)),
            size(100),
            "a larger limit should be reduced to the maximum"
        );
    }

    fn entity_uuids(count: u128) -> Vec<EntityUuid> {
        (1..=count)
            .map(|index| EntityUuid::new(Uuid::from_u128(index)))
            .collect()
    }

    #[test]
    fn split_page_short() {
        let (page, next) = split_page(entity_uuids(2), size(3), |entity_uuid| *entity_uuid);
        assert_eq!(
            page,
            entity_uuids(2),
            "a short page should keep every entity"
        );
        assert_eq!(next, None, "a short page should be the last");
    }

    #[test]
    fn split_page_full() {
        let (page, next) = split_page(entity_uuids(3), size(3), |entity_uuid| *entity_uuid);
        assert_eq!(
            page,
            entity_uuids(3),
            "a full page should keep every entity"
        );
        assert_eq!(
            next, None,
            "a full page without one more entity should be the last"
        );
    }

    #[test]
    fn split_page_more() {
        let (page, next) = split_page(entity_uuids(4), size(3), |entity_uuid| *entity_uuid);
        assert_eq!(page, entity_uuids(3), "the extra entity should be left out");
        assert_eq!(
            next,
            Some(Cursor::after(EntityUuid::new(Uuid::from_u128(3)))),
            "the next page should start after the last entity on this one"
        );
    }

    #[test]
    fn next_page_uri_limit() {
        let cursor = Cursor::after(EntityUuid::new(Uuid::from_u128(
            0xBE2C5B2F_E3E1_4F26_A0C4_0F8B5E9C4A1D,
        )));
        assert_eq!(
            next_page_uri(cursor, None),
            "?cursor=be2c5b2fe3e14f26a0c40f8b5e9c4a1d",
            "a request without a limit should lead to a next page without one"
        );
        assert_eq!(
            next_page_uri(cursor, Some(size(20))),
            "?cursor=be2c5b2fe3e14f26a0c40f8b5e9c4a1d&limit=20",
            "the limit of the request should be kept"
        );
    }
}
