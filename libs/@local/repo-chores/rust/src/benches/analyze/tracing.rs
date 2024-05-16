use std::{
    fs::File,
    io,
    io::{BufRead, BufReader},
    path::Path,
};

use error_stack::Report;

use crate::benches::report::Measurement;
#[derive(Debug)]
pub struct FoldedStacks {
    stacks: Vec<String>,
}

impl FoldedStacks {
    pub fn lines(&self) -> impl Iterator<Item = &str> {
        self.stacks.iter().map(String::as_str)
    }
}

impl FoldedStacks {
    /// Reads the folded stacks from the given measurement.
    ///
    /// The folded stacks are expected to be stored in a file named `tracing.folded` in the
    /// directory of the measurement in the given `artifact_output` directory.
    ///
    /// Returns `None` if the file does not exist.
    ///
    /// # Errors
    ///
    /// Returns an error if reading from the file fails.
    pub fn from_measurement(
        artifact_output: impl AsRef<Path>,
        measurement: &Measurement,
    ) -> Result<Option<Self>, Report<io::Error>> {
        let path = artifact_output
            .as_ref()
            .join("tracing")
            .join(&measurement.info.directory_name)
            .join("tracing.folded");

        if path.exists() {
            Ok(Some(Self::from_file(path)?))
        } else {
            Ok(None)
        }
    }

    /// Reads the folded stacks from the given file.
    ///
    /// # Errors
    ///
    /// Returns an error if reading from the file fails.
    pub fn from_file(input: impl AsRef<Path>) -> Result<Self, Report<io::Error>> {
        Ok(Self {
            stacks: BufReader::new(File::open(input)?)
                .lines()
                .collect::<Result<_, _>>()?,
        })
    }
}
