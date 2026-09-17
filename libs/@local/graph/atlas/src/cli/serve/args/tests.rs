//! Cases covering the serve command's flags: what they parse into and what they refuse.

use core::time::Duration;

use clap::{Args as _, FromArgMatches as _};

use super::ServeArgs;
use crate::serve::{
    delta::DeltaTaskOptions, document::DocumentLimits, runtime::manager::ManagerOptions,
};

/// A key in uppercase hex, the form most key exports and `hexdump` emit.
const UPPERCASE: &str = "6AD599A5C17E1FC4D7E2988BD4F3E0367F3C4A35D6DAE135F9A1E0EFC775CE55";

/// Parses `ServeArgs` from `arguments` and returns the rendered refusal.
///
/// # Panics
///
/// Panics when `arguments` parses, since this helper takes the refusal as its result.
fn refusal(arguments: &[&str]) -> String {
    ServeArgs::augment_args(clap::Command::new("serve"))
        .try_get_matches_from(arguments)
        .expect_err("an invalid secret refuses")
        .render()
        .to_string()
}

/// Asserts that the refusal omits the secret and every single-quoted character.
///
/// # Panics
///
/// Panics when the refusal repeats the whole secret or any one of its characters in single quotes.
#[track_caller]
fn assert_redacted(rendered: &str, secret: &str) {
    assert!(
        !rendered.contains(secret),
        "the whole secret reached the refusal:\n{rendered}"
    );
    for character in secret.chars() {
        assert!(
            !rendered.contains(&format!("'{character}'")),
            "a character of the secret reached the refusal:\n{rendered}"
        );
    }
}

/// Parses [`ServeArgs`] from `arguments` prefixed by a valid secret.
///
/// # Panics
///
/// Panics if `arguments` does not parse as valid serving arguments, or if the parsed matches do
/// not construct serving settings.
pub(in crate::cli::serve) fn parse(arguments: &[&str]) -> ServeArgs {
    let secret = UPPERCASE.to_ascii_lowercase();
    let mut invocation = vec!["serve", "--secret", secret.as_str()];
    invocation.extend_from_slice(arguments);
    let matches = ServeArgs::augment_args(clap::Command::new("serve"))
        .try_get_matches_from(invocation)
        .expect("valid serving arguments should parse");
    ServeArgs::from_arg_matches(&matches)
        .expect("parsed arguments should construct serving settings")
}

#[test]
fn options_mapping() {
    let args = parse(&[
        "--delta-poll-interval",
        "7",
        "--delta-safety-lag",
        "11",
        "--delta-retry-polls",
        "3",
        "--delta-placement-backlog",
        "19",
        "--delta-minimum-projection-interval",
        "4",
        "--generation-poll-interval",
        "2",
        "--unlink-expired-generations",
    ]);
    let delta = DeltaTaskOptions::from(args.delta);
    assert_eq!(delta.feed.tick_rate, Duration::from_secs(7));
    assert_eq!(delta.placement.tick_rate, delta.feed.tick_rate);
    assert_eq!(delta.feed.safety_lag, Duration::from_secs(11));
    assert_eq!(
        (
            delta.placement.tries_database,
            delta.placement.tries_workflow
        ),
        (3, 3)
    );
    assert_eq!(delta.placement.max_pending.get(), 19);
    assert_eq!(delta.placement.minimum_projection_interval, 4);

    let manager = ManagerOptions::from(args.manager);
    assert_eq!(manager.poll_interval, Duration::from_secs(2));
    assert!(
        manager.unlink,
        "the explicit unlink flag should enable removal"
    );
}

/// The document limit flags reach the tile, locate and edges limits.
///
/// One colored type id budget serves both tile and locate, and generation removal stays off when no
/// flag asks for it.
#[test]
fn limits_mapping() {
    let args = parse(&[
        "--colored-type-ids",
        "5",
        "--locate-edges",
        "9",
        "--edges",
        "11",
    ]);
    let limits = DocumentLimits::from(args.limits);
    assert_eq!(
        (limits.tile.colored_type_ids, limits.locate.colored_type_ids),
        (5, 5)
    );
    assert_eq!(limits.locate.edges, 9);
    assert_eq!(limits.edges.edges, 11);

    let defaults = parse(&[]);
    assert!(
        !ManagerOptions::from(defaults.manager).unlink,
        "removal should remain opt-in"
    );
}

#[test]
fn secret_uppercase() {
    assert_redacted(&refusal(&["serve", "--secret", UPPERCASE]), UPPERCASE);
}

/// A secret carrying the trailing newline a file or pipe leaves behind is refused.
///
/// The refusal quotes none of it: the case a redaction by whole-string match misses.
#[test]
fn secret_trailing_newline() {
    let secret = format!("{}\n", UPPERCASE.to_ascii_lowercase());
    assert_redacted(&refusal(&["serve", "--secret", &secret]), &secret);
}
