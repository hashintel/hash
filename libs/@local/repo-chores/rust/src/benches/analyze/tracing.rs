use std::{
    fs::File,
    io,
    io::{BufRead, BufReader},
    path::Path,
};

use bytes::Bytes;
use error_stack::{Context, Report};
use inferno::flamegraph;

use crate::benches::{generate_path, report::Measurement};
#[derive(Debug)]
pub struct FoldedStacks {
    data: Vec<String>,
}

impl From<FoldedStacks> for Bytes {
    fn from(value: FoldedStacks) -> Self {
        Self::from(value.data.join("\n"))
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
            .join(generate_path(
                &measurement.info.group_id,
                measurement.info.function_id.as_deref(),
                measurement.info.value_str.as_deref(),
            ))
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
        let reader = BufReader::new(File::open(input.as_ref())?);
        Ok(Self {
            data: reader.lines().collect::<Result<_, _>>()?,
        })
    }

    /// Creates a flame graph from the folded stacks.
    ///
    /// # Errors
    ///
    /// Returns an error if creating the flame graph fails.
    pub fn create_flame_graph(
        &self,
        mut options: flamegraph::Options,
    ) -> Result<FlameGraph, Report<impl Context>> {
        let mut buffer = Vec::new();
        flamegraph::from_lines(
            &mut options,
            self.data
                .iter()
                .filter(|line| {
                    // Lines that start with "ThreadId(1)-main " (note the trailing space) do not
                    // contain other information
                    !line.starts_with("ThreadId(1)-main ")
                })
                .skip(1)
                .map(AsRef::as_ref),
            &mut buffer,
        )?;

        Ok(FlameGraph {
            data: buffer.into_boxed_slice(),
        })
    }
}

pub struct FlameGraph {
    data: Box<[u8]>,
}

impl From<FlameGraph> for Bytes {
    fn from(value: FlameGraph) -> Self {
        Self::from(value.data)
    }
}
