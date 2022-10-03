//! Currently disabled because of https://github.com/dtolnay/trybuild/issues/171

// #[cfg_attr(not(nightly), ignore = "Outputs are different across toolchains")]
// #[cfg_attr(miri, ignore = "Miri does not support UI tests")]
// #[test]
// fn ui() {
//     let t = trybuild::TestCases::new();
//     t.compile_fail("tests/ui/*.rs");
// }
