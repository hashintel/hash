use core::time::Duration;

use axum::{Router, routing::get};
use reqwest::{
    Url,
    header::{HeaderMap, HeaderValue, RETRY_AFTER},
};
use rstest::rstest;
use tokio::time::Instant;

use super::{Pacer, client, retry_after, validate};
use crate::sources::{SourceError, tests::server};

#[tokio::test]
async fn destinations_reject_private_resolution() {
    let server = server(Router::new().route("/", get(|| async { "ok" }))).await;
    let url = server.url().replace("127.0.0.1", "localhost");
    let guarded = client().expect("should build a guarded client");
    let error = guarded
        .get(url)
        .send()
        .await
        .expect_err("should block private DNS destinations");
    assert!(
        error.is_request() || error.is_connect(),
        "should fail before an HTTP response"
    );
}

#[rstest]
#[case::ipv4_loopback("http://127.0.0.1")]
#[case::ipv6_loopback("http://[::1]")]
#[case::mapped_loopback("http://[::ffff:127.0.0.1]")]
#[case::link_local("http://169.254.169.254")]
#[case::shared_address("http://100.64.0.1")]
#[case::zero_network("http://0.1.2.3")]
#[case::multicast("http://224.0.0.1")]
#[case::documentation_address("http://192.0.2.1")]
#[case::ipv6_private("http://[fc00::1]")]
#[case::inline_credentials("http://user:password@example.org")]
#[case::file_scheme("file:///etc/passwd")]
fn destinations_invalid_url(#[case] address: &str) {
    let error = validate(&Url::parse(address).expect("should parse the URL"))
        .expect_err("should reject the unsafe destination");
    assert!(
        matches!(error.current_context(), SourceError::Destination),
        "should identify an invalid destination"
    );
}

#[tokio::test(start_paused = true)]
async fn pacing_across_callers() {
    let pacer = Pacer::default();
    let start = Instant::now();
    pacer
        .wait("one.test", Duration::from_millis(50))
        .await
        .expect("should reserve a request");
    let ((), ()) = tokio::join!(
        async {
            pacer
                .wait("one.test", Duration::from_millis(50))
                .await
                .expect("should reserve the second request");
        },
        async {
            pacer
                .wait("other.test", Duration::from_millis(50))
                .await
                .expect("should allow another host immediately");
            assert_eq!(
                start.elapsed(),
                Duration::ZERO,
                "another host should be independent"
            );
        }
    );
    pacer
        .wait("one.test", Duration::from_millis(50))
        .await
        .expect("should reserve the third request");
    assert_eq!(
        start.elapsed(),
        Duration::from_millis(100),
        "callers should share the host interval"
    );
    pacer
        .wait("one.test", Duration::from_millis(200))
        .await
        .expect("should apply a longer requested interval");
    assert_eq!(
        start.elapsed(),
        Duration::from_millis(300),
        "should honor the current caller's longer interval"
    );
    pacer
        .wait("one.test", Duration::ZERO)
        .await
        .expect("should honor the preceding caller's interval");
    assert_eq!(
        start.elapsed(),
        Duration::from_millis(500),
        "a faster caller should retain the preceding caller's spacing"
    );
}

#[rstest]
#[case::zero("0", Some(Duration::ZERO))]
#[case::seconds("1", Some(Duration::from_secs(1)))]
#[case::capped("31", Some(Duration::from_secs(30)))]
#[case::maximum("18446744073709551615", Some(Duration::from_secs(30)))]
#[case::invalid("not-an-integer", None)]
fn retry_after_values(#[case] value: &'static str, #[case] expected: Option<Duration>) {
    let mut headers = HeaderMap::new();
    headers.insert(RETRY_AFTER, HeaderValue::from_static(value));
    assert_eq!(
        retry_after(&headers),
        expected,
        "numeric delays should be capped and invalid values should leave the backoff unchanged"
    );
}
