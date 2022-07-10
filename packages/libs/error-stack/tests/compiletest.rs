#[cfg_attr(not(nightly), ignore = "Outputs are different on toolchains")]
#[cfg_attr(miri, ignore = "Miri does not support UI tests")]
#[test]
fn ui() {
    let t = trybuild::TestCases::new();
    t.compile_fail("tests/ui/*.rs");
}
