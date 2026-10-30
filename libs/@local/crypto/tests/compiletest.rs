#[test]
#[cfg_attr(
    miri,
    ignore = "trybuild runs `cargo` as a subprocess, which Miri cannot spawn"
)]
fn ui() {
    trybuild::TestCases::new().compile_fail("tests/ui/*.rs");
}
