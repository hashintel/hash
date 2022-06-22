use std::path::PathBuf;

use serde::Serialize;

use crate::{
    package::{experiment::ExperimentId, simulation::SimulationId},
    Result,
};

/// Maximum size of a string kept in memory.
/// Corresponds to the maximum size of a non-terminal part (see multipart uploading)
const MAX_BYTE_SIZE: usize = 5242880;
const IN_MEMORY_SIZE: usize = MAX_BYTE_SIZE * 2;

const CHAR_COMMA: u8 = 0x2C; // ,
const CHAR_OPEN_LEFT_SQUARE_BRACKET: u8 = 0x5B; // [
const CHAR_OPEN_RIGHT_SQUARE_BRACKET: u8 = 0x5D; // ]

/// ### Buffer for list of outputs
///
/// Persists in parts onto disk with an in-memory cache layer
pub struct OutputPartBuffer {
    output_type: &'static str,
    current: Vec<u8>,
    pub parts: Vec<PathBuf>,
    base_path: PathBuf,
    initial_step: bool,
}

impl OutputPartBuffer {
    pub fn new(
        output_type_name: &'static str,
        experiment_id: &ExperimentId,
        simulation_run_id: SimulationId,
    ) -> Result<OutputPartBuffer> {
        let base_path = std::env::temp_dir()
            .join(experiment_id.to_string())
            .join(simulation_run_id.to_string());

        std::fs::create_dir_all(&base_path)?;

        // Twice the size so we rarely exceed it
        let mut current = Vec::with_capacity(IN_MEMORY_SIZE * 2);
        current.push(CHAR_OPEN_LEFT_SQUARE_BRACKET); // New step array

        Ok(OutputPartBuffer {
            output_type: output_type_name,
            current,
            parts: Vec::new(),
            base_path,
            initial_step: true,
        })
    }

    // TODO: UNUSED: Needs triage
    pub fn is_at_capacity(&self) -> bool {
        self.current.len() > IN_MEMORY_SIZE
    }

    pub fn persist_current_on_disk(&mut self) -> Result<()> {
        tracing::trace!("Persisting current output to disk");
        let mut next_i = self.parts.len();

        let current = std::mem::replace(
            &mut self.current,
            Vec::from(String::with_capacity(IN_MEMORY_SIZE * 2)),
        );

        let trailing_part = if current.len() % MAX_BYTE_SIZE != 0 {
            1
        } else {
            0
        };
        // Number of parts we can make / number of parts we need to fit output
        let part_count = trailing_part + current.len() / MAX_BYTE_SIZE;

        for i in 0..part_count {
            let mut path = self.base_path.clone();
            path.push(format!("{}-{}.part", self.output_type, next_i));
            std::fs::File::create(&path)?;

            let contents = if i == part_count - 1 {
                &current[i * MAX_BYTE_SIZE..]
            } else {
                &current[i * MAX_BYTE_SIZE..(i + 1) * MAX_BYTE_SIZE]
            };

            std::fs::write(&path, contents)?;
            self.parts.push(path);
            next_i += 1;
        }

        Ok(())
    }

    pub fn append_step<S: Serialize>(&mut self, step: S) -> Result<()> {
        if !self.initial_step {
            self.current.push(CHAR_COMMA); // Previous step existed
        } else {
            self.initial_step = false;
        }

        let mut step_vec = serde_json::to_vec(&step)?;
        self.current.append(&mut step_vec);

        Ok(())
    }

    pub fn finalize(&mut self) -> Result<&[PathBuf]> {
        self.current.push(CHAR_OPEN_RIGHT_SQUARE_BRACKET);
        self.persist_current_on_disk()?;
        Ok(&self.parts)
    }
}

impl Drop for OutputPartBuffer {
    fn drop(&mut self) {
        for part in &self.parts {
            std::fs::remove_file(part)
                .unwrap_or_else(|error| tracing::error!("Failed to remove part {part:?}: {error}"))
        }
        std::fs::remove_dir_all(&self.base_path).unwrap_or_else(|error| {
            tracing::error!(
                "Failed to temporary part directory {:?}: {error}",
                &self.base_path
            )
        });
    }
}
