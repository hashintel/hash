//! Route integration with a test-owned generation and PostgreSQL database.
//!
//! PostgreSQL must accept `postgres` / `postgres` at localhost:5432. Each case creates and migrates
//! a separate database, seeds its own visibility data and removes it after generation shutdown.

#![expect(
    clippy::indexing_slicing,
    reason = "a malformed response should fail the integration case"
)]

extern crate alloc;

use alloc::collections::BTreeSet;
use core::time::Duration;

use axum::{
    Router,
    body::{Body, to_bytes},
    http::{HeaderMap, Method, Request, StatusCode, header::CONTENT_TYPE},
};
use hash_graph_atlas::test_utils::RouteFixture;
use hash_middleware::authentication::request::ACTOR_ID_HEADER;
use serde_json::{Value, json};
use tokio::time::{sleep, timeout};
use tower::ServiceExt as _;

const AUTHORITY_HEADER: &str = "atlas-authority";
const OPENAPI_PATH: &str = "/v1/atlas/openapi.json";

/// Sends one request through the production router and consumes its body.
///
/// # Panics
///
/// Panics if routing or body collection fails.
async fn send(router: &Router, request: Request<Body>) -> (StatusCode, HeaderMap, Vec<u8>) {
    let response = router
        .clone()
        .oneshot(request)
        .await
        .expect("should complete the request");
    let (parts, body) = response.into_parts();
    let body = to_bytes(body, 1 << 20)
        .await
        .expect("should read the response body");
    (parts.status, parts.headers, body.to_vec())
}

/// Waits for the fixture's published generation to become available.
///
/// # Panics
///
/// Panics if the generation does not become ready or the response names another generation.
async fn ready(fixture: &RouteFixture) {
    let (status, _, body) = timeout(Duration::from_secs(10), async {
        loop {
            let response = send(
                &fixture.router,
                Request::get("/v1/atlas/current")
                    .header(ACTOR_ID_HEADER, fixture.actor.to_string())
                    .body(Body::empty())
                    .expect("should build the request"),
            )
            .await;
            if response.0 != StatusCode::SERVICE_UNAVAILABLE {
                break response;
            }
            sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("should make the fixture generation available");
    assert_eq!(
        status,
        StatusCode::OK,
        "should serve current: {}",
        String::from_utf8_lossy(&body)
    );
    let current: Value = serde_json::from_slice(&body).expect("should decode current");
    assert_eq!(current["generation"], fixture.generation);
}

/// A value from the tile's restricted CBOR metadata profile.
#[derive(Debug)]
enum Cbor {
    Uint(u64),
    Bytes(Vec<u8>),
    Array(Vec<Self>),
    Map(Vec<(u64, Self)>),
    Other,
}

impl Cbor {
    /// Returns an integer metadata field.
    ///
    /// # Panics
    ///
    /// Panics if this value has another type.
    fn uint(&self) -> u64 {
        let Self::Uint(value) = self else {
            panic!("should contain an unsigned integer: {self:?}")
        };
        *value
    }

    /// Looks up a required integer-keyed metadata field.
    ///
    /// # Panics
    ///
    /// Panics if this is not a map or the key is absent.
    fn entry(&self, key: u64) -> &Self {
        let Self::Map(entries) = self else {
            panic!("should contain a metadata map: {self:?}")
        };
        &entries
            .iter()
            .find(|(candidate, _)| *candidate == key)
            .expect("should contain the required metadata field")
            .1
    }
}

/// Decodes one metadata value, advancing the unread byte slice.
///
/// # Panics
///
/// Panics on truncated input or a value outside the tile metadata profile.
fn cbor(bytes: &mut &[u8]) -> Cbor {
    let initial = bytes[0];
    *bytes = &bytes[1..];
    let argument = match initial & 31 {
        value @ 0..=23 => u64::from(value),
        value @ 24..=27 => {
            let length = 1_usize << (value - 24);
            let (value, rest) = bytes.split_at(length);
            *bytes = rest;
            value.iter().fold(0_u64, |accumulator, byte| {
                (accumulator << 8) | u64::from(*byte)
            })
        }
        _ => panic!("should use definite-length metadata"),
    };
    match initial >> 5 {
        0 => Cbor::Uint(argument),
        2 => {
            let (value, rest) =
                bytes.split_at(usize::try_from(argument).expect("should fit the response buffer"));
            *bytes = rest;
            Cbor::Bytes(value.to_vec())
        }
        4 => Cbor::Array(
            core::iter::repeat_with(|| cbor(bytes))
                .take(usize::try_from(argument).expect("should fit the response buffer"))
                .collect(),
        ),
        5 => Cbor::Map(
            core::iter::repeat_with(|| {
                let key = cbor(bytes).uint();
                (key, cbor(bytes))
            })
            .take(usize::try_from(argument).expect("should fit the response buffer"))
            .collect(),
        ),
        7 => Cbor::Other,
        _ => panic!("should use the tile metadata profile"),
    }
}

/// Separates the metadata map and row identifiers from a tile envelope.
///
/// # Panics
///
/// Panics on a malformed envelope layout, metadata value or row-id section.
#[expect(
    clippy::little_endian_bytes,
    reason = "the tile envelope uses little-endian integers"
)]
fn tile(bytes: &[u8]) -> (Cbor, BTreeSet<u32>) {
    assert!(bytes.len() >= 16, "should contain the envelope header");
    assert_eq!(&bytes[..8], b"SALTILET");
    assert_eq!(
        u16::from_le_bytes(bytes[8..10].try_into().expect("should read wire version")),
        1
    );
    let section = |slot: usize| {
        let start = 16 + slot * 8;
        assert!(
            bytes.len() >= start + 8,
            "should contain the section directory entry"
        );
        let from = u32::from_le_bytes(
            bytes[start..start + 4]
                .try_into()
                .expect("should read section start"),
        ) as usize;
        let to = u32::from_le_bytes(
            bytes[start + 4..start + 8]
                .try_into()
                .expect("should read section end"),
        ) as usize;
        &bytes[from..to]
    };
    let mut metadata = section(0);
    let head = cbor(&mut metadata);
    assert!(metadata.is_empty(), "should consume the metadata section");
    let (words, remainder) = section(2).as_chunks::<4>();
    assert!(
        remainder.is_empty(),
        "should contain complete row identifiers"
    );
    let rows: BTreeSet<_> = words.iter().map(|word| u32::from_le_bytes(*word)).collect();
    assert_eq!(rows.len(), words.len(), "should not repeat a row");
    assert_eq!(
        section(1).len(),
        rows.len() * 8,
        "should carry one coordinate pair per row"
    );
    (head, rows)
}

#[tokio::test(flavor = "multi_thread")]
async fn routes_authentication() {
    Box::pin(RouteFixture::run(async |fixture| {
        let (status, _, body) = send(
            &fixture.router,
            Request::get(OPENAPI_PATH)
                .header(ACTOR_ID_HEADER, fixture.actor.to_string())
                .body(Body::empty())
                .expect("should build OpenAPI request"),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let document: Value =
            serde_json::from_slice(&body).expect("should decode the route document");
        let mut operations: Vec<_> = document["paths"]
            .as_object()
            .expect("should list routes")
            .iter()
            .flat_map(|(path, operations)| {
                operations
                    .as_object()
                    .expect("should list operations")
                    .keys()
                    .filter_map(|method| {
                        Method::from_bytes(method.to_ascii_uppercase().as_bytes())
                            .ok()
                            .map(|method| (method, path.clone()))
                    })
            })
            .collect();
        assert!(
            operations
                .iter()
                .any(|(_, path)| path == "/v1/atlas/current"),
            "should exercise the registered routes"
        );
        operations.extend([
            (Method::GET, OPENAPI_PATH.to_owned()),
            (Method::GET, "/v1/atlas/openapi".to_owned()),
        ]);
        for (method, template) in operations {
            let path = template
                .split('/')
                .map(|segment| {
                    if segment.starts_with('{') {
                        "0"
                    } else {
                        segment
                    }
                })
                .collect::<Vec<_>>()
                .join("/");
            let (status, headers, body) = send(
                &fixture.router,
                Request::builder()
                    .method(method.clone())
                    .uri(path)
                    .body(Body::empty())
                    .expect("should build the unauthenticated request"),
            )
            .await;
            assert_eq!(
                status,
                StatusCode::UNAUTHORIZED,
                "should require an actor for {method} {template}"
            );
            assert_eq!(headers[CONTENT_TYPE], "application/problem+json");
            let problem: Value = serde_json::from_slice(&body).expect("should decode the problem");
            assert_eq!(problem["type"], "/problems/atlas/unauthenticated");
        }
        let (status, _, _) = send(
            &fixture.router,
            Request::get("/status")
                .body(Body::empty())
                .expect("should build liveness request"),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
    }))
    .await;
}

#[tokio::test(flavor = "multi_thread")]
async fn tile_scoped_store_rows() {
    Box::pin(RouteFixture::run(async |fixture| {
        ready(fixture).await;
        let (status, headers, body) = send(
            &fixture.router,
            Request::post(format!(
                "/v1/atlas/generation/{}/manifest",
                fixture.generation
            ))
            .header(ACTOR_ID_HEADER, fixture.actor.to_string())
            .header(CONTENT_TYPE, "application/json")
            .body(Body::from(json!({"all": []}).to_string()))
            .expect("should build the scoped manifest request"),
        )
        .await;
        assert_eq!(
            status,
            StatusCode::OK,
            "should resolve the test store's visibility: {}",
            String::from_utf8_lossy(&body)
        );
        let manifest: Value = serde_json::from_slice(&body).expect("should decode the manifest");
        let token = headers[AUTHORITY_HEADER]
            .to_str()
            .expect("should return a header-safe token");
        let (status, headers, body) = send(
            &fixture.router,
            Request::post(format!("/v1/atlas/tile/{}/plain/0/0/0", fixture.generation))
                .header(ACTOR_ID_HEADER, fixture.actor.to_string())
                .header(AUTHORITY_HEADER, token)
                .body(Body::empty())
                .expect("should build the tile request"),
        )
        .await;
        assert_eq!(
            status,
            StatusCode::OK,
            "should serve the scoped tile: {}",
            String::from_utf8_lossy(&body)
        );
        assert_eq!(headers[CONTENT_TYPE], "application/vnd.hash.saltile-v1");
        let (head, rows) = tile(&body);
        assert_eq!(
            rows,
            BTreeSet::from(fixture.visible_rows),
            "should deliver exactly the rows present in the test store"
        );
        assert_eq!(head.entry(4).uint(), 3);
        let Cbor::Bytes(generation) = head.entry(0) else {
            panic!("should carry the generation bytes")
        };
        let expected: Vec<_> = fixture
            .generation
            .as_bytes()
            .as_chunks::<2>()
            .0
            .iter()
            .map(|pair| {
                u8::from_str_radix(
                    str::from_utf8(pair).expect("should contain hexadecimal digits"),
                    16,
                )
                .expect("should decode the identity")
            })
            .collect();
        assert_eq!(*generation, expected);
        let Cbor::Array(runs) = head.entry(7) else {
            panic!("should carry per-bucket row counts")
        };
        let span = manifest["bucketSchedule"]["span"]
            .as_u64()
            .expect("should declare the bucket span");
        let offset = manifest["scopeSchedule"]["k"]
            .as_u64()
            .expect("should declare the scoped offset");
        assert!(offset > 0, "should exercise nonzero scoped delivery");
        let cut = u64::from(span.trailing_zeros()) + offset;
        assert_eq!(manifest["scopeSchedule"]["cut"], format!("z+{cut}"));
        assert_eq!(runs.len() as u64, cut + 1);
        assert_eq!(runs.iter().map(Cbor::uint).sum::<u64>(), 3);
        let (status, headers, body) = send(
            &fixture.router,
            Request::post(format!("/v1/atlas/tile/{}/plain/0/0/0", fixture.generation))
                .header(ACTOR_ID_HEADER, fixture.other_actor.to_string())
                .header(AUTHORITY_HEADER, token)
                .body(Body::empty())
                .expect("should build the foreign-actor request"),
        )
        .await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "should reject another actor's authority token"
        );
        assert_eq!(headers[CONTENT_TYPE], "application/problem+json");
        let problem: Value =
            serde_json::from_slice(&body).expect("should decode the token rejection");
        assert_eq!(problem["type"], "/problems/atlas/unauthorized");
    }))
    .await;
}
