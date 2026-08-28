//! Captures and verifies the route-served scoped-tile fixture.
//!
//! The delivery contract wants one fixture whose bytes come through the served route rather
//! than from the encoder. A manifest resolved over a live store declares a nonzero delivery-cut
//! offset beside the authority token, and the data request presents that token. The TypeScript
//! client then decodes the checked-in response bytes under the declared schedule. The hand-built
//! corpus in `fixtures/wire/` pins the grammar. This fixture pins the composition that
//! transports it.
//!
//! The test stands where a hosting binary stands. It builds the router through
//! [`ServeCommand::run`] over the store the `HASH_GRAPH_PG_*` environment names and the
//! generation root `HASH_GRAPH_ATLAS_ROOT` names, supplies the request facilities a host
//! supplies - its credential verifier resolves the actor header directly - and then speaks to
//! the router as an HTTP client. No crate internals participate, so the captured bytes witness
//! the composition production serves, from the actor header and the sealed filter through token
//! admission to tile assembly.
//!
//! A fitted generation is not a standing property of every checkout, so the test runs only when
//! `ATLAS_ROUTE_FIXTURE` selects a mode and reports itself skipped otherwise:
//!
//! - `capture` re-captures the fixture against the live store and writes
//!   `fixtures/wire/r1-scoped-route-tile.saltile` with its JSON sidecar.
//! - `verify` re-captures and requires byte equality with the checked-in fixture, refusing with a
//!   re-bless instruction when the active generation is not the one the fixture records.
//!
//! `ATLAS_ROUTE_FIXTURE_ACTOR` names the requesting actor. The fixture's charter is nonzero cut
//! transport, so the capture refuses a resolution whose offset is zero. An actor whose view
//! attains the density band at the recorded schedule resolves that zero and cannot produce this
//! fixture. The sidecar records the served manifest declaration verbatim, and the TypeScript
//! conformance test derives its delivery cut from that declaration rather than from a constant.

#![expect(
    clippy::indexing_slicing,
    reason = "an out-of-bounds read of a captured envelope is exactly this test's failure mode"
)]
#![expect(
    clippy::wildcard_enum_match_arm,
    reason = "the bounded reader refuses every shape the wire profile does not name"
)]
#![expect(
    clippy::little_endian_bytes,
    clippy::big_endian_bytes,
    reason = "the envelope's integers are little-endian and CBOR arguments big-endian, per \
              contract"
)]
#![expect(
    clippy::std_instead_of_alloc,
    reason = "an integration test target is a std binary with no alloc crate of its own"
)]

use core::{num::NonZeroU32, ops::ControlFlow};
use std::{fs, path::PathBuf, sync::Arc};

use axum::{
    body::Body,
    http::{HeaderMap, Request, StatusCode, header::CONTENT_TYPE},
};
use clap::Parser;
use error_stack::Report;
use hash_graph_atlas::cli::{
    RequestFacilities, RootArgs, ServeArgs, ServeCommand, VisibilityLimits,
};
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
    PostgresStoreSettings,
};
use hash_middleware::{
    authentication::{
        provider::AuthenticationProvider,
        request::{ACTOR_ID_HEADER, AuthenticationError, actor_id_from_header},
    },
    rate_limit::{ClientIpSource, RateLimitConfig, RateLimitMode},
};
use serde_json::{Value, json};
use tokio_postgres::NoTls;
use tower::ServiceExt as _;
use type_system::principal::actor::{ActorId, UserId};

/// Resolves the actor header as a delegated user, standing where the deployment's credential
/// chain stands.
///
/// The fixture's charter is transport, so the verifier trusts the header the test sends itself,
/// without the service-secret ceremony or the store's actor-kind lookup. The named actor is a
/// user in the arranged store.
struct HeaderDelegation;

impl AuthenticationProvider<Option<ActorId>> for HeaderDelegation {
    fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> impl Future<Output = ControlFlow<Result<Option<ActorId>, Report<AuthenticationError>>>> + Send
    {
        core::future::ready(match actor_id_from_header(headers) {
            Ok(actor) => ControlFlow::Break(Ok(Some(ActorId::User(UserId::new(actor))))),
            Err(AuthenticationError::MissingDelegatedActor) => ControlFlow::Continue(()),
            Err(error) => ControlFlow::Break(Err(Report::new(error))),
        })
    }
}

/// The response header carrying the issued authority token.
const AUTHORITY_HEADER: &str = "atlas-authority";

/// The fixture's basename under `fixtures/wire/`.
const FIXTURE_NAME: &str = "r1-scoped-route-tile";

/// The all-row filter document is the caller filter that admits every row its policies admit.
///
/// Its presence is what makes the resolved scope mask-backed. A filtered request compiles
/// through the store's entity-query compiler regardless of how the actor's policies compile,
/// so the proof carries real masks rather than the unfiltered fast path.
const FILTER: &str = r#"{"all": []}"#;

/// The environment contract, stated once for the skip report and the failure messages.
const ENV_CONTRACT: &str = "set ATLAS_ROUTE_FIXTURE=capture|verify with HASH_GRAPH_ATLAS_ROOT, \
                            HASH_GRAPH_ATLAS_SECRET, ATLAS_ROUTE_FIXTURE_ACTOR, and the \
                            HASH_GRAPH_PG_* store variables against a live store";

/// The hosting invocation flattens the same two flag groups as the `hash-graph atlas` binary.
#[derive(Debug, Parser)]
struct Invocation {
    #[command(flatten)]
    root: RootArgs,
    #[command(flatten)]
    serve: ServeArgs,
}

/// One decoded CBOR value under the wire profile.
///
/// The profile is deliberately small (`docs/wire.md` section 4): unsigned integers, byte and
/// text strings, arrays, integer-keyed maps, booleans, null, and f32. This reader exists so the
/// sidecar's expected values come from an implementation independent of the TypeScript decoder.
/// It reads exactly the profile and refuses everything else.
#[derive(Debug, Clone, PartialEq)]
enum Cbor {
    Uint(u64),
    Bytes(Vec<u8>),
    Array(Vec<Self>),
    Map(Vec<(u64, Self)>),
    Bool(bool),
    Null,
    F32(f32),
}

impl Cbor {
    fn uint(&self) -> u64 {
        match self {
            Self::Uint(value) => *value,
            other => panic!("expected an unsigned integer, read {other:?}"),
        }
    }

    fn array(&self) -> &[Self] {
        match self {
            Self::Array(items) => items,
            other => panic!("expected an array, read {other:?}"),
        }
    }

    fn entry(&self, key: u64) -> &Self {
        self.get(key)
            .unwrap_or_else(|| panic!("the head carries no key {key}"))
    }

    fn get(&self, key: u64) -> Option<&Self> {
        match self {
            Self::Map(entries) => entries
                .iter()
                .find(|(entry, _)| *entry == key)
                .map(|(_, value)| value),
            other => panic!("expected a map, read {other:?}"),
        }
    }
}

/// Reads one value at `at`, returning it with the offset one past its end.
fn read_cbor(bytes: &[u8], at: usize) -> (Cbor, usize) {
    let initial = bytes[at];
    let (major, info) = (initial >> 5, initial & 0x1F);
    let (argument, mut next) = match info {
        0..=23 => (u64::from(info), at + 1),
        24 => (u64::from(bytes[at + 1]), at + 2),
        25 => {
            let raw: [u8; 2] = bytes[at + 1..at + 3].try_into().expect("two bytes follow");
            (u64::from(u16::from_be_bytes(raw)), at + 3)
        }
        26 => {
            let raw: [u8; 4] = bytes[at + 1..at + 5].try_into().expect("four bytes follow");
            (u64::from(u32::from_be_bytes(raw)), at + 5)
        }
        27 => {
            let raw: [u8; 8] = bytes[at + 1..at + 9]
                .try_into()
                .expect("eight bytes follow");
            (u64::from_be_bytes(raw), at + 9)
        }
        _ => panic!("additional information {info} is outside the wire profile"),
    };

    match major {
        0 => (Cbor::Uint(argument), next),
        2 => {
            let length = usize::try_from(argument).expect("byte strings fit in memory");
            (
                Cbor::Bytes(bytes[next..next + length].to_vec()),
                next + length,
            )
        }
        4 => {
            let mut items = Vec::new();
            for _ in 0..argument {
                let (item, after) = read_cbor(bytes, next);
                items.push(item);
                next = after;
            }
            (Cbor::Array(items), next)
        }
        5 => {
            let mut entries = Vec::new();
            for _ in 0..argument {
                let (key, after_key) = read_cbor(bytes, next);
                let (value, after_value) = read_cbor(bytes, after_key);
                entries.push((key.uint(), value));
                next = after_value;
            }
            (Cbor::Map(entries), next)
        }
        7 => match info {
            20 => (Cbor::Bool(false), next),
            21 => (Cbor::Bool(true), next),
            22 => (Cbor::Null, next),
            26 => {
                let raw: [u8; 4] = bytes[at + 1..at + 5].try_into().expect("four bytes follow");
                (Cbor::F32(f32::from_be_bytes(raw)), at + 5)
            }
            other => panic!("simple value {other} is outside the wire profile"),
        },
        other => panic!("major type {other} is outside the wire profile"),
    }
}

/// One parsed `SALTILET` envelope: the head map and the raw column sections.
struct Envelope {
    head: Cbor,
    positions: Vec<u8>,
    row_ids: Vec<u8>,
}

/// Parses and validates the envelope regions of `docs/wire.md` section 2.
///
/// Asserts the fixed prefix, the directory's shape for the minimal-detail tile this fixture
/// pins (`TYPE_MASK` and `MASS` absent), and section alignment.
fn parse_envelope(bytes: &[u8]) -> Envelope {
    assert_eq!(&bytes[..8], b"SALTILET", "the magic names a tile envelope");
    let field = |at: usize| u16::from_le_bytes([bytes[at], bytes[at + 1]]);
    assert_eq!(field(8), 1, "wireVersion is 1");
    assert_eq!(field(10), 0, "flags are zero");
    let slots = usize::from(field(12));
    assert_eq!(slots, 5, "a tile envelope carries five slots");
    assert_eq!(field(14), 0, "reserved is zero");

    let entry = |slot: usize| {
        let at = 16 + slot * 8;
        let word = |offset: usize| {
            let raw: [u8; 4] = bytes[at + offset..at + offset + 4]
                .try_into()
                .expect("the directory carries eight bytes per slot");
            usize::try_from(u32::from_le_bytes(raw)).expect("offsets fit usize")
        };
        (word(0), word(4))
    };

    let (head_start, head_end) = entry(0);
    assert_eq!(head_start, 16 + slots * 8, "HEAD starts the payload region");
    let (positions_start, positions_end) = entry(1);
    assert!(
        positions_start.is_multiple_of(8),
        "POSITIONS starts 8-aligned"
    );
    let (row_ids_start, row_ids_end) = entry(2);
    assert_eq!(
        entry(3),
        (0, 0),
        "TYPE_MASK is absent without coloredTypeIds"
    );
    assert_eq!(entry(4), (0, 0), "MASS is absent under wireVersion 1");

    let (head, consumed) = read_cbor(&bytes[head_start..head_end], 0);
    assert_eq!(consumed, head_end - head_start, "the HEAD is one CBOR item");

    Envelope {
        head,
        positions: bytes[positions_start..positions_end].to_vec(),
        row_ids: bytes[row_ids_start..row_ids_end].to_vec(),
    }
}

/// Little-endian u32 words of a column section, the sidecar's bit-pattern form.
fn words_of(section: &[u8]) -> Vec<u32> {
    section
        .as_chunks::<4>()
        .0
        .iter()
        .map(|chunk| u32::from_le_bytes(*chunk))
        .collect()
}

/// Sends one request through the router and returns the status, headers, and body.
async fn send(
    router: &axum::Router,
    request: Request<Body>,
) -> (StatusCode, axum::http::HeaderMap, Vec<u8>) {
    let response = router
        .clone()
        .oneshot(request)
        .await
        .expect("the router is infallible");
    let (parts, body) = response.into_parts();
    let bytes = axum::body::to_bytes(body, usize::MAX)
        .await
        .expect("the response body is finite");
    (parts.status, parts.headers, bytes.to_vec())
}

/// Captures the fixture through the served route and verifies every law it pins.
///
/// Skips, loudly, unless `ATLAS_ROUTE_FIXTURE` selects a mode: the fixture's bytes depend on a
/// fitted generation and a live store, which are operator-arranged rather than properties of
/// every checkout. The checked-in fixture with the TypeScript conformance test remains the
/// standing witness. This test is the honest re-derivation path.
#[expect(
    clippy::too_many_lines,
    reason = "the capture is one linear protocol run whose order is the contract it witnesses"
)]
#[tokio::test(flavor = "multi_thread")]
async fn route_served_scoped_tile_fixture() {
    let Ok(mode) = std::env::var("ATLAS_ROUTE_FIXTURE") else {
        eprintln!("route_served_scoped_tile_fixture: skipped; {ENV_CONTRACT}");
        return;
    };
    assert!(
        mode == "capture" || mode == "verify",
        "ATLAS_ROUTE_FIXTURE selects capture or verify, not {mode:?}",
    );
    let actor = std::env::var("ATLAS_ROUTE_FIXTURE_ACTOR")
        .unwrap_or_else(|_| panic!("ATLAS_ROUTE_FIXTURE_ACTOR names the actor; {ENV_CONTRACT}"));

    let store = |name: &str, fallback: &str| {
        std::env::var(format!("HASH_GRAPH_PG_{name}")).unwrap_or_else(|_| fallback.to_owned())
    };
    let connection = DatabaseConnectionInfo::new(
        DatabaseType::Postgres,
        store("USER", "postgres"),
        store("PASSWORD", "postgres"),
        store("HOST", "localhost"),
        store("PORT", "5432").parse().expect("the port is numeric"),
        store("DATABASE", "graph"),
    );
    let pool = PostgresStorePool::new(
        &connection,
        &DatabasePoolConfig::default(),
        NoTls,
        PostgresStoreSettings::default(),
    )
    .await
    .expect("the store the HASH_GRAPH_PG_* environment names is reachable");

    // The fixture is a claim about the change under test, never about live store state, so the
    // delta consumer stays off and the served bytes come from the generation alone.
    let invocation = Invocation::parse_from(["route-fixture", "--no-delta"]);
    // Observe mode, because the fixture pins transport rather than budgets, and a oneshot
    // request has no connection info for the per-address key to read.
    let quota = |value| NonZeroU32::new(value).expect("the quota is non-zero");
    let facilities = RequestFacilities {
        provider: Arc::new(HeaderDelegation),
        service_secret: Arc::from("route-fixture-service-secret"),
        rate_limit: RateLimitConfig {
            rate_limit_mode: RateLimitMode::Observe,
            client_ip_source: ClientIpSource::ConnectInfo,
            rate_limit_gate_per_second: quota(10),
            rate_limit_gate_burst: quota(50),
            rate_limit_anonymous_per_hour: quota(60),
            rate_limit_anonymous_burst: quota(50),
            rate_limit_actor_per_hour: quota(6000),
            rate_limit_actor_burst: quota(100),
        },
    };
    let router = ServeCommand::new(invocation.root, invocation.serve)
        .run(
            Arc::new(pool),
            VisibilityLimits::default(),
            None,
            facilities,
        )
        .expect("the root holds an activated generation and a wire secret is configured");

    // The generation under serve, from the route that names it.
    let (status, _, body) = send(
        &router,
        Request::get("/v1/atlas/current")
            .header(ACTOR_ID_HEADER, &actor)
            .body(Body::empty())
            .expect("the request builds"),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
    let current: Value = serde_json::from_slice(&body).expect("current is JSON");
    let generation = current["generation"]
        .as_str()
        .expect("current names the generation")
        .to_owned();

    // The manifest resolves the filtered scope: the declaration and the token arrive together,
    // which is the pairing the fixture exists to pin.
    let (status, headers, body) = send(
        &router,
        Request::post(format!("/v1/atlas/generation/{generation}/manifest"))
            .header(ACTOR_ID_HEADER, &actor)
            .header(CONTENT_TYPE, "application/json")
            .body(Body::from(FILTER))
            .expect("the request builds"),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
    let manifest: Value = serde_json::from_slice(&body).expect("the manifest is JSON");
    let token = headers
        .get(AUTHORITY_HEADER)
        .expect("the manifest mints an authority token")
        .to_str()
        .expect("the token is ASCII")
        .to_owned();

    let span = manifest["bucketSchedule"]["span"]
        .as_u64()
        .expect("the manifest declares the recorded span");
    assert!(span.is_power_of_two(), "the span is a power of two");
    let span_log2 = span.trailing_zeros();
    let offset = manifest["scopeSchedule"]["k"]
        .as_u64()
        .expect("the manifest declares the caller's offset");
    assert!(
        offset >= 1,
        "the fixture's charter is nonzero cut transport: this scope resolved k = 0, so the chosen \
         actor's view attains the density band at the recorded schedule and cannot produce it; \
         choose an actor whose view saturates instead",
    );
    let cut_addend = span_log2 + u32::try_from(offset).expect("offsets are small");
    assert_eq!(
        manifest["scopeSchedule"]["cut"].as_str(),
        Some(format!("z+{cut_addend}").as_str()),
        "the declared cut rule is the declared span and offset",
    );

    // The root tile under the sealed scope, all-defaults query.
    let (status, headers, tile) = send(
        &router,
        Request::post(format!("/v1/atlas/tile/{generation}/plain/0/0/0"))
            .header(ACTOR_ID_HEADER, &actor)
            .header(AUTHORITY_HEADER, &token)
            .body(Body::empty())
            .expect("the request builds"),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&tile));
    assert_eq!(
        headers
            .get(CONTENT_TYPE)
            .map(axum::http::HeaderValue::as_bytes),
        Some(b"application/vnd.hash.saltile-v1".as_slice()),
        "a tile answers as saltile bytes",
    );

    let envelope = parse_envelope(&tile);
    let head = &envelope.head;
    assert_eq!(
        head.entry(0),
        &Cbor::Bytes(hex_bytes(&generation)),
        "the head echoes the served generation",
    );
    assert_eq!(head.entry(1).uint(), 0, "the head echoes the plain variant");
    assert_eq!(
        head.entry(2).array(),
        &[Cbor::Uint(0), Cbor::Uint(0), Cbor::Uint(0)],
        "the head echoes the root coordinate",
    );
    assert_eq!(head.entry(3).uint(), 0, "the default mode is delta");

    let delivered = head.entry(4).uint();
    assert!(delivered > 0, "a fixture of nothing witnesses nothing");
    assert!(
        head.get(5).is_none(),
        "key 5 is retired and no response emits it"
    );
    assert_eq!(head.entry(6).uint(), 0, "a delta root starts at bucket 0");

    let runs: Vec<u64> = head.entry(7).array().iter().map(Cbor::uint).collect();
    assert_eq!(
        runs.len(),
        usize::try_from(cut_addend + 1).expect("cuts are small"),
        "the root carries one run per bucket through the declared cut z + {cut_addend}",
    );
    assert_eq!(
        runs.iter().sum::<u64>(),
        delivered,
        "sum(runs) = delivered is law in every response",
    );

    let global = head.entry(8);
    let children = head.entry(9).uint();
    assert!(children <= 0xF, "children is a four-bit occupancy mask");
    assert_eq!(
        head.entry(10),
        &Cbor::Bool(false),
        "minimal detail declares no trailer"
    );

    assert_eq!(
        envelope.positions.len() as u64,
        delivered * 8,
        "POSITIONS carries one f32 xy pair per delivered point",
    );
    assert_eq!(
        envelope.row_ids.len() as u64,
        delivered * 4,
        "ROW_IDS carries one u32 per delivered point",
    );

    let bounds: Vec<Value> = global
        .entry(1)
        .array()
        .iter()
        .map(|value| match value {
            Cbor::F32(bits) => json!(bits.to_bits()),
            other => panic!("bounds carry f32 values, read {other:?}"),
        })
        .collect();

    let sidecar = json!({
        "golden": FIXTURE_NAME,
        "layer": "tile",
        "declaration": {
            "generation": generation,
            "wireVersion": manifest["wireVersion"],
            "bucketSchedule": manifest["bucketSchedule"],
            "scopeSchedule": manifest["scopeSchedule"],
        },
        "request": {
            "filter": serde_json::from_str::<Value>(FILTER).expect("the filter is JSON"),
            "actor": actor,
            "variant": "plain",
            "coordinate": [0, 0, 0],
            "detail": "minimal",
        },
        "prefix": {
            "magic": "SALTILET",
            "wireVersion": 1,
            "flags": 0,
            "slotCount": 5,
            "reserved": 0,
        },
        "head": {
            "generation": generation,
            "variant": 0,
            "coordinate": [0, 0, 0],
            "mode": 0,
            "delivered": delivered,
            "firstBucket": 0,
            "runs": runs,
            "children": children,
            "trailer": false,
            "global": {
                "visibleAtZoom": global.entry(0).uint(),
                "boundsBits": bounds,
                "minResolution": global.entry(2).uint(),
            },
        },
        "positions": words_of(&envelope.positions),
        "rowIds": words_of(&envelope.row_ids),
        "typeMask": Value::Null,
        "trailer": Value::Null,
        "mass": Value::Null,
        "appended": Value::Null,
    });
    let sidecar_text = format!(
        "{}\n",
        serde_json::to_string_pretty(&sidecar).expect("sidecars are plain JSON"),
    );

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/wire");
    let bytes_path = dir.join(format!("{FIXTURE_NAME}.saltile"));
    let sidecar_path = dir.join(format!("{FIXTURE_NAME}.json"));

    if mode == "capture" {
        fs::write(&bytes_path, &tile).expect("the fixture directory is writable");
        fs::write(&sidecar_path, &sidecar_text).expect("the fixture directory is writable");
        eprintln!(
            "captured {} and {}",
            bytes_path.display(),
            sidecar_path.display()
        );
        return;
    }

    let pinned_sidecar: Value = serde_json::from_slice(
        &fs::read(&sidecar_path).expect("the checked-in sidecar exists; capture first"),
    )
    .expect("the checked-in sidecar parses");
    assert_eq!(
        pinned_sidecar["declaration"]["generation"].as_str(),
        Some(generation.as_str()),
        "the active generation is not the fixture's; re-capture with ATLAS_ROUTE_FIXTURE=capture \
         and re-run the TypeScript conformance test",
    );
    let pinned = fs::read(&bytes_path).expect("the checked-in fixture exists; capture first");
    assert_eq!(
        pinned, tile,
        "the served route reproduces the checked-in bytes"
    );
    assert_eq!(
        serde_json::from_str::<Value>(&sidecar_text).expect("the fresh sidecar parses"),
        pinned_sidecar,
        "the re-derived sidecar agrees with the checked-in one",
    );
}

/// The byte form of a lowercase hex string.
fn hex_bytes(hex: &str) -> Vec<u8> {
    hex.as_bytes()
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| {
            u8::from_str_radix(str::from_utf8(pair).expect("hex is ASCII"), 16)
                .expect("the string is hexadecimal")
        })
        .collect()
}
