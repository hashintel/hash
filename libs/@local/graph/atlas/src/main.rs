//! The standalone atlas operator binary.
//!
//! Everything lives in [`hash_graph_atlas::cli`]. This shell only redirects into it.

fn main() -> std::process::ExitCode {
    hash_graph_atlas::cli::main()
}
