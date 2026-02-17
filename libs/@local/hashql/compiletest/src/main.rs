//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]

fn main() {
    hashql_compiletest::runner::cli::run();
}
