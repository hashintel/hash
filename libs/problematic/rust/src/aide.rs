use alloc::{
    borrow::ToOwned as _,
    collections::BTreeMap,
    format,
    string::{String, ToString as _},
    vec,
    vec::Vec,
};

use aide::{
    OperationOutput,
    generate::GenContext,
    openapi::{
        Example, Header, HeaderStyle, MediaType, Operation, ParameterSchemaOrContent, ReferenceOr,
        Response, SchemaObject, StatusCode,
    },
    transform::TransformOpenApi,
    util::iter_operations_mut,
};
use schemars::{JsonSchema, Schema, json_schema};

#[cfg(feature = "axum")]
use crate::problem::contains;
use crate::{Problem, ProblemDetails, Variant, problem::assert_variants, serde::STANDARD_MEMBERS};

impl<E: JsonSchema> OperationOutput for ProblemDetails<'_, E> {
    type Inner = Self;

    fn operation_response(ctx: &mut GenContext, _operation: &mut Operation) -> Option<Response> {
        Some(problem_response(
            String::from("An RFC 9457 problem details document."),
            problem_media(ctx.schema.subschema_for::<Self>()),
        ))
    }

    fn inferred_responses(
        ctx: &mut GenContext,
        operation: &mut Operation,
    ) -> Vec<(Option<StatusCode>, Response)> {
        Self::operation_response(ctx, operation)
            .map(|response| (None, response))
            .into_iter()
            .collect()
    }
}

/// An internal error prevented the request from completing.
#[cfg(feature = "axum")]
#[derive(JsonSchema)]
struct Internal;

#[cfg(feature = "axum")]
impl<K: Problem> OperationOutput for crate::axum::Rejection<K> {
    type Inner = Self;

    fn operation_response(_ctx: &mut GenContext, _operation: &mut Operation) -> Option<Response> {
        None
    }

    /// Documents the variants of `K` and the internal problem on `operation` itself and infers
    /// nothing, so they join the responses other sources documented for the same status.
    fn inferred_responses(
        ctx: &mut GenContext,
        operation: &mut Operation,
    ) -> Vec<(Option<StatusCode>, Response)> {
        const INTERNAL: Variant = Variant::bare::<Internal>(crate::axum::INTERNAL);
        const {
            assert_variants::<K>();
            assert!(
                !contains(K::VARIANTS, INTERNAL.problem_type()),
                "`VARIANTS` should not list the internal problem"
            );
        };

        merge(ctx, operation, K::VARIANTS.iter().chain([&INTERNAL]));
        Vec::new()
    }
}

/// Documents the variants of `P` on `operation`, one response per status.
///
/// A status another source already documented problems for gets one response with the variants
/// of both, rendered anew from them: changes made to that response in between are lost. A status
/// that already has a non-problem response keeps it, and the variants of `P` for that status are
/// not documented.
///
/// # Panics
///
/// Panics if a variant's extension members are neither an object nor a unit, or name a standard
/// member, or if a source of the operation already documented its problem type and status
/// differently.
pub fn document_problem<P: Problem>(context: &mut GenContext, operation: &mut Operation) {
    const { assert_variants::<P>() };

    merge(context, operation, P::VARIANTS);
}

/// The extension a problem response keeps its variants in until [`finish`] removes it.
const FRAGMENTS: &str = "x-problem-variants";

/// Removes the `x-problem-variants` extension that merging keeps on every problem response.
///
/// Apply it after the last source has documented its problems: a response it has run over no
/// longer merges.
pub fn finish(mut transform: TransformOpenApi<'_>) -> TransformOpenApi<'_> {
    let document = transform.inner_mut();
    let operations = document
        .paths
        .iter_mut()
        .flat_map(|paths| paths.paths.values_mut())
        .filter_map(ReferenceOr::as_item_mut)
        .flat_map(|path| iter_operations_mut(path).map(|(_, operation)| operation))
        .filter_map(|operation| operation.responses.as_mut())
        .flat_map(|responses| responses.responses.values_mut());
    let components = document
        .components
        .iter_mut()
        .flat_map(|components| components.responses.values_mut());
    for response in operations
        .chain(components)
        .filter_map(ReferenceOr::as_item_mut)
    {
        response.extensions.shift_remove(FRAGMENTS);
    }
    transform
}

/// One variant as a response documents it.
#[derive(Debug, PartialEq, serde::Serialize, serde::Deserialize)]
struct Fragment {
    type_uri: String,
    title: String,
    status: u16,
    description: Option<String>,
    schema: Schema,
    example: Option<serde_json::Value>,
    headers: Vec<HeaderFragment>,
}

#[derive(Debug, PartialEq, serde::Serialize, serde::Deserialize)]
struct HeaderFragment {
    name: String,
    description: String,
    schema: Schema,
}

impl Fragment {
    fn of(context: &mut GenContext, base: &Schema, variant: &Variant) -> Self {
        let problem_type = variant.problem_type();
        let extensions = variant.extensions(&mut context.schema);
        assert_members(variant, &extensions);

        Self {
            type_uri: problem_type.type_uri.to_string(),
            title: problem_type.title.to_string(),
            status: problem_type.status.as_u16(),
            description: schema_description(&extensions),
            example: example(variant, &extensions),
            schema: variant_schema(base, variant, extensions),
            headers: variant
                .headers()
                .iter()
                .map(|header| HeaderFragment {
                    name: header.name().to_owned(),
                    description: header.description().to_owned(),
                    schema: header.schema(&mut context.schema),
                })
                .collect(),
        }
    }

    fn same_problem(&self, other: &Self) -> bool {
        self.status == other.status && self.type_uri == other.type_uri
    }
}

/// Documents `variants` on `operation`, joining the problems already documented per status.
fn merge<'v>(
    context: &mut GenContext,
    operation: &mut Operation,
    variants: impl IntoIterator<Item = &'v Variant>,
) {
    let base = context.schema.subschema_for::<ProblemDetails<'static>>();
    let mut by_status = BTreeMap::<u16, Vec<Fragment>>::new();
    for variant in variants {
        let fragment = Fragment::of(context, &base, variant);
        by_status.entry(fragment.status).or_default().push(fragment);
    }

    let responses = operation.responses.get_or_insert_default();
    for (status, fragments) in by_status {
        let status = StatusCode::Code(status);
        let mut merged = match responses.responses.get(&status) {
            None => Vec::new(),
            Some(existing) => match existing.as_item().and_then(fragments_of) {
                Some(merged) => merged,
                // A non-problem response keeps its status.
                None => continue,
            },
        };
        for fragment in fragments {
            join(&mut merged, fragment);
        }
        responses
            .responses
            .insert(status, ReferenceOr::Item(render(merged)));
    }
}

/// The variants a problem response documents, or `None` for a non-problem response.
fn fragments_of(response: &Response) -> Option<Vec<Fragment>> {
    let fragments = response.extensions.get(FRAGMENTS)?;
    Some(
        serde_json::from_value(fragments.clone())
            .expect("the documented problem variants should deserialize"),
    )
}

/// Adds `fragment` to `fragments` unless it is documented there already.
///
/// # Panics
///
/// Panics if `fragments` documents the problem type and status of `fragment` differently.
fn join(fragments: &mut Vec<Fragment>, fragment: Fragment) {
    match fragments
        .iter()
        .find(|present| present.same_problem(&fragment))
    {
        Some(present) => assert!(
            *present == fragment,
            "`{}` at {} should be documented the same by every source of the operation",
            fragment.type_uri,
            fragment.status
        ),
        None => fragments.push(fragment),
    }
}

/// The response documenting `fragments`, which share one status.
fn render(fragments: Vec<Fragment>) -> Response {
    let mut media = problem_media(response_schema(&fragments));
    add_examples(&mut media, &fragments);

    let mut response = problem_response(describe(&fragments), media);
    add_headers(&mut response, &fragments);
    response.extensions.insert(
        FRAGMENTS.to_owned(),
        serde_json::to_value(fragments).expect("the problem variants should serialize"),
    );
    response
}

/// The schema of the one variant, or a `oneOf` over every variant.
fn response_schema(fragments: &[Fragment]) -> Schema {
    if let [fragment] = fragments {
        return fragment.schema.clone();
    }

    let schemas = fragments
        .iter()
        .map(|fragment| &fragment.schema)
        .collect::<Vec<_>>();
    json_schema!({ "oneOf": schemas })
}

/// Adds the example of the one variant, or a named example per variant that has one.
fn add_examples(media: &mut MediaType, fragments: &[Fragment]) {
    if let [fragment] = fragments {
        media.example.clone_from(&fragment.example);
        return;
    }

    // `assert_variants` and `join` keep the type URI unique within one status.
    media.examples = fragments
        .iter()
        .filter_map(|fragment| {
            let example = fragment.example.clone()?;
            Some((
                fragment.type_uri.clone(),
                ReferenceOr::Item(Example {
                    summary: Some(fragment.title.clone()),
                    value: Some(example),
                    ..Example::default()
                }),
            ))
        })
        .collect();
}

/// Adds every header of the variants, required where each variant sends it.
fn add_headers(response: &mut Response, fragments: &[Fragment]) {
    for header in fragments.iter().flat_map(|fragment| &fragment.headers) {
        if response
            .headers
            .keys()
            .any(|name| name.eq_ignore_ascii_case(&header.name))
        {
            continue;
        }
        let required = fragments.iter().all(|fragment| {
            fragment
                .headers
                .iter()
                .any(|candidate| candidate.name.eq_ignore_ascii_case(&header.name))
        });
        response.headers.insert(
            header.name.clone(),
            ReferenceOr::Item(Header {
                description: Some(header.description.clone()),
                style: HeaderStyle::Simple,
                required,
                deprecated: None,
                format: ParameterSchemaOrContent::Schema(SchemaObject {
                    json_schema: header.schema.clone(),
                    example: None,
                    external_docs: None,
                }),
                example: None,
                examples: [].into(),
                extensions: [].into(),
            }),
        );
    }
}

fn problem_response(description: String, media: MediaType) -> Response {
    Response {
        description,
        content: [(String::from("application/problem+json"), media)].into(),
        ..Response::default()
    }
}

fn problem_media(schema: Schema) -> MediaType {
    MediaType {
        schema: Some(SchemaObject {
            json_schema: schema,
            example: None,
            external_docs: None,
        }),
        ..MediaType::default()
    }
}

/// The description of a response: that of its one variant, or a list item per variant with its
/// title.
///
/// A variant is described by its extension schema, which a derived schema takes from the doc
/// comment, and otherwise by its title alone.
fn describe(fragments: &[Fragment]) -> String {
    if let [fragment] = fragments {
        return fragment
            .description
            .clone()
            .unwrap_or_else(|| fragment.title.clone());
    }

    fragments
        .iter()
        .map(|fragment| {
            let title = &fragment.title;
            fragment.description.as_ref().map_or_else(
                || format!("- {title}"),
                // Indented, so a description of several paragraphs stays within its list item.
                |description| format!("- {title}: {}", description.replace('\n', "\n  ")),
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Checks that `extensions` describes members the variant's problem details can carry.
///
/// Every branch of `oneOf`, `anyOf` and `allOf` is checked, as an enum's variants are described
/// there. A branch referencing a definition is not followed.
///
/// # Panics
///
/// Panics if the members or one of their branches are neither an object nor a unit, or name a
/// standard member. Either would fail to serialize, and the occurrence would be answered as an
/// internal error.
fn assert_members(variant: &Variant, extensions: &Schema) {
    assert_members_of(&variant.problem_type().type_uri, extensions.as_value());
}

fn assert_members_of(type_uri: &str, schema: &serde_json::Value) {
    if let Some(kind) = schema.get("type").and_then(serde_json::Value::as_str) {
        assert!(
            kind == "object" || kind == "null",
            "the extension members of `{type_uri}` should serialize as an object, not as `{kind}`"
        );
    }
    if let Some(properties) = schema
        .get("properties")
        .and_then(serde_json::Value::as_object)
    {
        for member in STANDARD_MEMBERS {
            assert!(
                !properties.contains_key(member),
                "the extension members of `{type_uri}` should not name the standard member \
                 `{member}`"
            );
        }
    }
    for keyword in ["oneOf", "anyOf", "allOf"] {
        for branch in schema
            .get(keyword)
            .and_then(serde_json::Value::as_array)
            .into_iter()
            .flatten()
        {
            assert_members_of(type_uri, branch);
        }
    }
}

fn schema_description(extensions: &Schema) -> Option<String> {
    extensions
        .get("description")
        .and_then(serde_json::Value::as_str)
        .map(ToOwned::to_owned)
}

/// The example occurrence of `variant`.
///
/// Without one, a variant without extension members is shown as its bare problem type. A variant
/// with members has no example then, as the bare problem type would lack them.
fn example(variant: &Variant, extensions: &Schema) -> Option<serde_json::Value> {
    variant.example().or_else(|| {
        without_members(extensions).then(|| {
            serde_json::to_value(ProblemDetails::from(variant.problem_type()))
                .expect("a bare problem type should serialize")
        })
    })
}

/// Whether `extensions` describes no members: a unit struct, whose schema has type `null`, or a
/// struct whose fields are all skipped.
///
/// Any keyword other than `type`, `title` and `description` counts as members.
fn without_members(extensions: &Schema) -> bool {
    extensions.as_object().is_some_and(|schema| {
        schema
            .iter()
            .all(|(keyword, value)| match keyword.as_str() {
                "type" => value == "null" || value == "object",
                "title" | "description" => true,
                _ => false,
            })
    })
}

fn variant_schema(base: &Schema, variant: &Variant, extensions: Schema) -> Schema {
    let mut all_of = vec![
        base.clone(),
        json_schema!({
            "properties": {
                "type": { "const": variant.problem_type().type_uri },
                "status": { "const": variant.problem_type().status.as_u16() },
            },
            "required": ["type"],
        }),
    ];
    if !without_members(&extensions) {
        all_of.push(extensions);
    }
    json_schema!({ "allOf": all_of })
}
