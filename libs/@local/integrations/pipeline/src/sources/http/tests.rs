use core::time::Duration;

use axum::{Router, routing::get};
use reqwest::{
    Url,
    header::{HeaderMap, HeaderValue, RETRY_AFTER},
};
use rstest::rstest;
use tokio::time::Instant;

use super::{Pacing, client, retry_after, validate};
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
async fn pacing_spaces_one_capture() {
    let start = Instant::now();
    let mut pacing = Pacing::new(Duration::from_millis(50));
    for _ in 0..3 {
        pacing.wait().await.expect("should pace the request");
    }
    assert_eq!(
        start.elapsed(),
        Duration::from_millis(100),
        "should space each request after the first by the interval"
    );
}

#[tokio::test(start_paused = true)]
async fn pacing_is_not_shared_between_captures() {
    let start = Instant::now();
    let mut slow = Pacing::new(Duration::from_hours(24));
    slow.wait().await.expect("should start the slow capture");
    // The slow capture's next request waits a day; cancelling it must leave nothing behind.
    let pending = tokio::spawn(async move { slow.wait().await });
    tokio::task::yield_now().await;
    pending.abort();
    let mut fast = Pacing::new(Duration::ZERO);
    for _ in 0..2 {
        fast.wait().await.expect("should pace the fast capture");
    }
    assert_eq!(
        start.elapsed(),
        Duration::ZERO,
        "another capture's interval and cancelled wait should not delay this one"
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
