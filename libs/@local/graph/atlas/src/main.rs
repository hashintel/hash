//! The standalone Atlas command-line application.

/// Runs an Atlas command and returns its process exit status.
fn main() -> std::process::ExitCode {
    hash_graph_atlas::cli::main()
}
