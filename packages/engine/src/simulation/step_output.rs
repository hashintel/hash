use super::packages::output::packages::Output;

pub struct SimulationStepOutput(Vec<Output>);

impl SimulationStepOutput {
    pub fn with_capacity(capacity: usize) -> SimulationStepOutput {
        SimulationStepOutput(Vec::with_capacity(capacity))
    }

    pub fn push(&mut self, output: Output) {
        self.0.push(output);
    }
}
