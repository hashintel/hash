use hashql_compiletest::compiletest_main;

// This is a bit... hacky, see the note on
// https://doc.rust-lang.org/cargo/reference/resolver.html#dev-dependency-cycles
// as to how this works.
// (essentially we're linking and building the same crate twice, meaning that we can't interact
// with anything in the crate itself)
// This test takes >600ms due to needing to run `cargo metadata`.
compiletest_main!();
