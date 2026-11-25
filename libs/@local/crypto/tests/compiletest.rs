// Miri cannot spawn the `cargo` and `rustc` processes `ui_test` runs.
#[cfg(miri)]
fn main() {}

#[cfg(not(miri))]
fn main() -> ui_test::Result<()> {
    use ui_test::{Config, dependencies::DependencyBuilder, run_tests};

    let mut config = Config::rustc("tests/ui");
    config.program.args.extend([
        "-Zunstable-options".into(),
        "--jobs-frontend=1".into(),
        "-Zui-testing".into(),
    ]);
    config.stderr_filter(
        "[^ ]+/lib/rustlib/src/rust/library/([^:]+):[0-9]+:[0-9]+",
        "$$RUST/$1:LL:COL",
    );

    // `ui_test` expects an artifact for every dependency, including optional ones.
    let mut dependencies = DependencyBuilder::default();
    dependencies.program.args.push("--all-features".into());
    config
        .comment_defaults
        .base()
        .set_custom("dependencies", dependencies);

    run_tests(config)
}
