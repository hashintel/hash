use std::{
    error::Error,
    fs::File,
    io::{BufRead, BufReader, Lines},
    path::Path,
};

use inferno::flamegraph;

use crate::benches::report::Measurement;

pub struct FoldedStacks {
    stacks: Vec<String>,
}

pub struct FlameGraph {
    data: Box<[u8]>,
}

impl FoldedStacks {
    pub fn from_measurement(
        base_path: impl AsRef<Path>,
        measurement: &Measurement,
    ) -> Result<Self, Box<dyn Error>> {
        let mut path = base_path.as_ref().join(&measurement.info.group_id);
        if let Some(function_id) = &measurement.info.function_id {
            path.join(function_id);
        }
        if let Some(value_str) = &measurement.info.value_str {
            path.join(value_str);
        }
        Self::from_file(path.join("tracing.folded"))
    }

    pub fn from_file(input: impl AsRef<Path>) -> Result<Self, Box<dyn Error>> {
        Ok(FoldedStacks {
            stacks: BufReader::new(File::open(input)?)
                .lines()
                .collect::<Result<_, _>>()?,
        })
    }

    pub fn create_flamegraph(&self) -> Result<FlameGraph, Box<dyn Error>> {
        let mut buffer = Vec::new();
        let mut options = flamegraph::Options::default();

        flamegraph::from_lines(
            &mut options,
            self.stacks.iter().map(String::as_str),
            &mut buffer,
        )?;

        Ok(FlameGraph {
            data: buffer.into_boxed_slice(),
        })
    }
}
