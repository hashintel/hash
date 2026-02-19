//! Code generator for `darwin-kperf-events`.
//!
//! Reads the kpep plist databases from `/usr/share/kpep/` and generates
//! Rust source files into `darwin-kperf-events` using `quote!`.
//!
//! # Usage
//!
//! ```sh
//! cargo run --package darwin-kperf-codegen
//! ```
extern crate alloc;

use std::path::PathBuf;

mod codegen;
mod database;

#[expect(clippy::print_stderr)]
fn main() -> Result<(), Box<dyn core::error::Error>> {
    let out_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("events")
        .join("src");

    let count = run(&out_dir)?;
    eprintln!("Generated {count} events into {}", out_dir.display());

    Ok(())
}

fn run(out_dir: &std::path::Path) -> Result<usize, Box<dyn core::error::Error>> {
    let chips = database::load_all()?;
    codegen::generate(out_dir, &chips)
}
