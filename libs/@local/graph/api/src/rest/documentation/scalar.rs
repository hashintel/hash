use std::sync::LazyLock;

use axum::{Router, body::Bytes, http::header::CONTENT_TYPE, response::Html, routing::get};
use scalar_api_reference::{get_asset, render_scalar};
use serde::Serialize;
use serde_json::{Map, Value};

use crate::rest::Api;

/// One document a Scalar reference lists.
#[derive(Serialize)]
pub(super) struct Source {
    pub title: String,
    pub slug: String,
    pub url: String,
}

impl From<&Api> for Source {
    fn from(api: &Api) -> Self {
        Self {
            title: api.document().info.title.clone(),
            slug: api.slug(),
            url: format!("{}/openapi.json", api.prefix()),
        }
    }
}

fn render(configuration: &str, sources: Value, bundle: &str) -> Result<Bytes, serde_json::Error> {
    let mut configuration: Map<String, Value> = serde_json::from_str(configuration)?;
    configuration.insert("sources".to_owned(), sources);
    configuration.insert(
        "persistAuth".to_owned(),
        Value::Bool(cfg!(debug_assertions)),
    );
    let configuration = Value::Object(configuration)
        .to_string()
        .replace('<', "\\u003c");
    Ok(Bytes::from(render_scalar(&configuration, Some(bundle))))
}

/// The Scalar bundle.
static JAVASCRIPT: LazyLock<Bytes> =
    LazyLock::new(|| Bytes::from(get_asset("scalar.js").expect("the Scalar bundle should exist")));

/// Serves a reference over `sources` at `path`, with the bundle it loads underneath.
pub(super) fn routes(path: &str, sources: &[Source]) -> Router {
    let sources = serde_json::to_value(sources).expect("the document sources should serialize");
    let bundle = format!("{}/openapi/scalar.js", path.trim_end_matches('/'));
    LazyLock::force(&JAVASCRIPT);

    let reference = {
        let html = render(include_str!("scalar.json"), sources, &bundle)
            .expect("the Scalar configuration should be a JSON object");
        get(move || core::future::ready(Html(html.clone())))
    };

    let router = Router::new().route(path, reference.clone()).route(
        &bundle,
        get(|| {
            core::future::ready((
                [(CONTENT_TYPE, "application/javascript")],
                JAVASCRIPT.clone(),
            ))
        }),
    );

    // Axum matches a trailing slash as its own path, so a prefixed reference needs both spellings;
    // the root has no second one.
    if path == "/" {
        router
    } else {
        router.route(&format!("{path}/"), reference)
    }
}
