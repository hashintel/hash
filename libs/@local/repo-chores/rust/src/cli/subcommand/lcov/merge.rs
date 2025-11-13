use core::error::Error;
use std::path::PathBuf;

use clap::Parser;
use error_stack::ResultExt as _;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, derive_more::Display)]
#[display("Unable to merge files")]
struct MergeError;

impl Error for MergeError {}

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub(crate) struct Args {
    /// Output file to write the benchmark results to.
    #[clap(short, long)]
    output: Option<PathBuf>,

    /// Inputs to merge.
    inputs: Vec<PathBuf>,
}

impl Args {
    pub(crate) fn run(self) -> Result<(), Box<dyn Error + Send + Sync>> {
        if let Some(output_file) = self.output {
            let file = std::fs::File::create(output_file).change_context(MergeError)?;
            let writer = std::io::BufWriter::new(file);

            crate::lcov::merge::transform(self.inputs, writer).change_context(MergeError)?;
        } else {
            crate::lcov::merge::transform(self.inputs, std::io::stdout())
                .change_context(MergeError)?;
        }

        Ok(())
    }
}
