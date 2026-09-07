//! The OpenAPI response clauses that more than one route states.
//!
//! A documented response is part of the contract, so two routes that answer one problem the same
//! way state it from one place. Divergent wording for an identical refusal reads as a difference
//! the server does not have. Each helper transforms one operation and composes through aide's
//! `with`, which keeps a route's documentation one chain naming the clauses it states. A clause
//! only one route answers stays in that route's own module.

use aide::{
    openapi,
    transform::{TransformOpenApi, TransformOperation},
    util::iter_operations_mut,
};

use super::{headers, problem::Problem};

/// The `401` the authentication middleware answers before any route runs.
const UNAUTHENTICATED: &str = "`unauthenticated`: the call names no valid actor";

/// States on every operation what the middleware in front of the router answers.
///
/// The request budgets and the authentication layer wrap the whole router, so their `429` and
/// `401` belong to every operation and are stated once here rather than by each route. An
/// operation that documents a `401` of its own keeps it and gains the middleware's cause beside
/// it, because one operation documents one `401`.
pub(super) fn middleware(mut api: TransformOpenApi<'_>) -> TransformOpenApi<'_> {
    let Some(paths) = api.inner_mut().paths.as_mut() else {
        return api;
    };
    for path in paths.paths.values_mut() {
        let openapi::ReferenceOr::Item(path) = path else {
            continue;
        };
        for (_, operation) in iter_operations_mut(path) {
            let mut operation = TransformOperation::new(operation).with(too_many_requests);
            let existing = operation
                .inner_mut()
                .responses
                .as_mut()
                .and_then(|responses| responses.responses.get_mut(&openapi::StatusCode::Code(401)));
            match existing {
                Some(openapi::ReferenceOr::Item(response)) => {
                    response.description =
                        format!("{UNAUTHENTICATED}, or {}", response.description);
                }
                Some(openapi::ReferenceOr::Reference { .. }) => {}
                None => {
                    let _: TransformOperation<'_> = operation.with(unauthenticated);
                }
            }
        }
    }
    api
}

/// States the middleware's `401` on an operation that documents no `401` of its own.
fn unauthenticated(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .response_with::<401, Problem<'static>, _>(|response| response.description(UNAUTHENTICATED))
}

/// States the `429` the request budgets answer, with the `Retry-After` header it carries.
fn too_many_requests(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation.response_with::<429, Problem<'static>, _>(|mut response| {
        response
            .inner()
            .headers
            .insert("Retry-After".to_owned(), headers::retry_after());
        response.description(
            "`too-many-requests`: the caller is over its per-address or per-actor budget; \
             `Retry-After` states whole seconds until it admits again",
        )
    })
}

/// States the `401` every authority-bearing route answers alike.
///
/// One uniform refusal covers every cause, so the documented remedy is all a caller learns from it.
pub(super) fn unauthorized(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation.response_with::<401, Problem<'static>, _>(|response| {
        response.description("`unauthorized`: no valid authority token; re-fetch the manifest")
    })
}

/// States the `422` every body-bearing route answers alike.
///
/// The body extractor keeps the framework's own status, so well-formed JSON that is not the
/// operation's shape - a mistyped member or an unknown one - answers `invalid-body` at 422,
/// while a body that is not JSON at all answers it at 400.
pub(super) fn invalid_body_data(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation.response_with::<422, Problem<'static>, _>(|response| {
        response.description(
            "`invalid-body`: well-formed JSON that is not this operation's shape - a mistyped \
             member or an unknown one",
        )
    })
}

/// States the catch-all clause covering what the enumerated responses do not.
pub(super) fn any_problem(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation.default_response_with::<Problem<'static>, _>(|response| {
        response.description("any other problem document; `internal` marks a server-side failure")
    })
}

/// Marks the operation's request body optional.
///
/// A declared body documents as required, including the `Option<Body<_>>` a route reading an absent
/// body as the all-defaults request accepts.
pub(super) fn optional_body(mut operation: TransformOperation<'_>) -> TransformOperation<'_> {
    if let Some(body) = body_mut(&mut operation) {
        body.required = false;
    }

    operation
}

/// Describes the operation's request body, naming what the body is for.
pub(super) fn describe_body(
    description: &'static str,
) -> impl FnOnce(TransformOperation<'_>) -> TransformOperation<'_> {
    move |mut operation| {
        if let Some(body) = body_mut(&mut operation) {
            body.description = Some(description.to_owned());
        }

        operation
    }
}

/// The operation's declared request body, when it declares one inline.
///
/// A body reaching the document as a component reference carries no per-operation text to edit, so
/// there is nothing to describe and nothing to mark.
fn body_mut<'body>(
    operation: &'body mut TransformOperation<'_>,
) -> Option<&'body mut openapi::RequestBody> {
    operation.inner_mut().request_body.as_mut()?.as_item_mut()
}

#[cfg(test)]
mod tests {
    use aide::{
        openapi,
        transform::{TransformOpenApi, TransformOperation},
    };

    use super::{UNAUTHENTICATED, middleware, unauthorized};

    /// One path with a bare `get` and a `post` that already states its own `401`.
    fn document() -> openapi::OpenApi {
        let mut post = openapi::Operation::default();
        let _: TransformOperation<'_> = TransformOperation::new(&mut post).with(unauthorized);
        let mut api = openapi::OpenApi {
            paths: Some(openapi::Paths {
                paths: core::iter::once((
                    "/route".to_owned(),
                    openapi::ReferenceOr::Item(openapi::PathItem {
                        get: Some(openapi::Operation::default()),
                        post: Some(post),
                        ..openapi::PathItem::default()
                    }),
                ))
                .collect(),
                ..openapi::Paths::default()
            }),
            ..openapi::OpenApi::default()
        };
        let _: TransformOpenApi<'_> = middleware(TransformOpenApi::new(&mut api));
        api
    }

    fn response<'document>(
        api: &'document openapi::OpenApi,
        method: &str,
        status: u16,
    ) -> Option<&'document openapi::Response> {
        let paths = api.paths.as_ref()?;
        let openapi::ReferenceOr::Item(path) = paths.paths.get("/route")? else {
            return None;
        };
        let operation = match method {
            "get" => path.get.as_ref()?,
            "post" => path.post.as_ref()?,
            _ => return None,
        };
        operation
            .responses
            .as_ref()?
            .responses
            .get(&openapi::StatusCode::Code(status))?
            .as_item()
    }

    #[test]
    fn too_many_requests_on_every_method() {
        let api = document();
        for method in ["get", "post"] {
            let response = response(&api, method, 429).expect("every method states 429");
            assert!(
                response.headers.contains_key("Retry-After"),
                "{method}: the 429 documents its Retry-After header"
            );
        }
    }

    #[test]
    fn unauthenticated_inserted_where_absent() {
        let api = document();
        let response = response(&api, "get", 401).expect("a route with no 401 gains one");
        assert_eq!(response.description, UNAUTHENTICATED);
    }

    #[test]
    fn unauthenticated_merged_into_own_401() {
        let api = document();
        let response = response(&api, "post", 401).expect("the route's own 401 stays");
        assert_eq!(
            response.description,
            format!(
                "{UNAUTHENTICATED}, or `unauthorized`: no valid authority token; re-fetch the \
                 manifest"
            )
        );
    }
}
