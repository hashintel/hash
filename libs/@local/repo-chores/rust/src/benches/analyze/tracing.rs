use core::error::Error;
use std::{
    fs::File,
    io::{self, BufRead as _, BufReader},
    path::Path,
};

use bytes::Bytes;
use error_stack::Report;
use inferno::flamegraph;

#[derive(Debug)]
pub(crate) struct FoldedStacks {
    data: Vec<String>,
}

impl From<FoldedStacks> for Bytes {
    fn from(value: FoldedStacks) -> Self {
        Self::from(value.data.join("\n"))
    }
}

impl FoldedStacks {
    /// Reads the folded stacks from the given file.
    ///
    /// # Errors
    ///
    /// Returns an error if reading from the file fails.
    pub(crate) fn from_file(input: impl AsRef<Path>) -> Result<Self, Report<io::Error>> {
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
    pub(crate) fn create_flame_graph(
        &self,
        mut options: flamegraph::Options,
    ) -> Result<FlameGraph, Report<impl Error + Send + Sync + 'static>> {
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

pub(crate) struct FlameGraph {
    data: Box<[u8]>,
}

impl From<FlameGraph> for Bytes {
    fn from(value: FlameGraph) -> Self {
        Self::from(value.data)
    }
}
