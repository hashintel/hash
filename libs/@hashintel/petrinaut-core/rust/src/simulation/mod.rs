//! Count-based simulation with a stable f64 buffer shared with compiled model programs.

mod wasm;

#[cfg(test)]
mod tests;

use alloc::collections::BTreeSet;

use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    pub parameters: Vec<f64>,
    pub counts: Vec<u32>,
    pub capacities: Vec<Option<u32>>,
    pub transitions: Vec<Transition>,
    pub dt: f64,
    pub max_frames: u32,
    pub seed: u32,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Transition {
    pub inputs: Vec<Input>,
    pub outputs: Vec<Output>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Input {
    pub place: usize,
    pub weight: u32,
    pub kind: ArcKind,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ArcKind {
    Standard,
    Read,
    Inhibitor,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Output {
    pub place: usize,
    pub weight: u32,
}

/// Buffer order: parameters, place counts, fired flags, firing counts, elapsed frames,
/// then frame number, status (0 ready, 1 running, 2 max time, 3 deadlock, 4 overflow), RNG state.
#[derive(Debug)]
pub struct Simulation {
    config: Config,
    values: Vec<f64>,
    pending: Vec<f64>,
    frame: u32,
    rng: u32,
    status: u8,
}

#[expect(
    clippy::indexing_slicing,
    reason = "Construction validates arc indices and allocates every buffer region used by the \
              stepping methods"
)]
#[expect(
    clippy::float_arithmetic,
    reason = "The shared model ABI uses f64 for exact u32 counts and stochastic rates"
)]
impl Simulation {
    /// # Errors
    /// Rejects invalid timing, mismatched buffers, invalid arcs, and duplicate arc places.
    pub fn new(config: Config) -> Result<Self, String> {
        if !config.dt.is_finite() || config.dt <= 0.0 {
            return Err("Simulation dt must be finite and positive".into());
        }
        if config.capacities.len() != config.counts.len()
            || config.parameters.iter().any(|value| !value.is_finite())
            || config.transitions.iter().any(|transition| {
                let mut input_places = BTreeSet::new();
                let mut output_places = BTreeSet::new();
                transition.inputs.iter().any(|arc| {
                    arc.place >= config.counts.len()
                        || arc.weight == 0
                        || !input_places.insert(arc.place)
                }) || transition.outputs.iter().any(|arc| {
                    arc.place >= config.counts.len()
                        || arc.weight == 0
                        || !output_places.insert(arc.place)
                })
            })
        {
            return Err(
                "Simulation buffers or arcs are invalid; arc places must be unique in each \
                 direction"
                    .into(),
            );
        }
        let mut values = config.parameters.clone();
        values.extend(config.counts.iter().map(|count| f64::from(*count)));
        values.resize(values.len() + 3 * config.transitions.len() + 3, 0.0);
        let pending = vec![0.0; config.counts.len()];
        let rng = config.seed;
        let mut simulation = Self {
            config,
            values,
            pending,
            frame: 0,
            rng,
            status: 0,
        };
        simulation.write_metadata();
        Ok(simulation)
    }

    #[must_use]
    pub fn values(&self) -> &[f64] {
        &self.values
    }

    const fn counts_offset(&self) -> usize {
        self.config.parameters.len()
    }

    const fn flags_offset(&self) -> usize {
        self.counts_offset() + self.config.counts.len()
    }

    fn write_metadata(&mut self) {
        let offset = self.values.len() - 3;
        self.values[offset] = f64::from(self.frame);
        self.values[offset + 1] = f64::from(self.status);
        self.values[offset + 2] = f64::from(self.rng);
    }

    /// Starts a frame. Call `fire` once per transition in model order, then `finish`.
    pub fn begin(&mut self) -> bool {
        if self.status >= 2 {
            return false;
        }
        if self.frame >= self.config.max_frames {
            self.status = 2;
            self.write_metadata();
            return false;
        }
        self.status = 1;
        self.pending.fill(0.0);
        let flags = self.flags_offset();
        self.values[flags..flags + self.config.transitions.len()].fill(0.0);
        true
    }

    fn enabled(&self, transition: &Transition) -> bool {
        let counts = &self.values[self.counts_offset()..self.flags_offset()];
        if !transition.inputs.iter().all(|arc| match arc.kind {
            ArcKind::Inhibitor => counts[arc.place] < f64::from(arc.weight),
            ArcKind::Read | ArcKind::Standard => counts[arc.place] >= f64::from(arc.weight),
        }) {
            return false;
        }
        transition.outputs.iter().all(|output| {
            let produced: f64 = transition
                .outputs
                .iter()
                .filter(|arc| arc.place == output.place)
                .map(|arc| f64::from(arc.weight))
                .sum();
            let consumed: f64 = transition
                .inputs
                .iter()
                .filter(|arc| arc.place == output.place && matches!(arc.kind, ArcKind::Standard))
                .map(|arc| f64::from(arc.weight))
                .sum();
            let delta = produced - consumed;
            delta <= 0.0
                || self.config.capacities[output.place].is_none_or(|capacity| {
                    counts[output.place] + self.pending[output.place] + delta <= f64::from(capacity)
                })
        })
    }

    /// Evaluates one transition against the counts left by earlier transitions in this frame.
    pub fn fire(&mut self, index: usize, rate: f64) {
        let Some(transition) = self.config.transitions.get(index) else {
            return;
        };
        if self.status != 1 || !self.enabled(transition) {
            return;
        }
        self.rng = self.rng.wrapping_mul(1_103_515_245).wrapping_add(12_345) & 0x7FFF_FFFF;
        if (-rate * self.config.dt).exp() > f64::from(self.rng) / 2_147_483_648.0 {
            return;
        }
        let offset = self.counts_offset();
        for arc in &transition.inputs {
            if matches!(arc.kind, ArcKind::Standard) {
                self.values[offset + arc.place] -= f64::from(arc.weight);
            }
        }
        for arc in &transition.outputs {
            self.pending[arc.place] += f64::from(arc.weight);
        }
        let flags = self.flags_offset();
        self.values[flags + index] = 1.0;
        self.values[flags + self.config.transitions.len() + index] += 1.0;
    }

    pub fn finish(&mut self) {
        if self.status != 1 {
            return;
        }
        let counts = self.counts_offset();
        for (index, pending) in self.pending.iter().enumerate() {
            self.values[counts + index] += pending;
            if self.values[counts + index] > f64::from(u32::MAX) {
                self.status = 4;
            }
        }
        self.pending.fill(0.0);
        let flags = self.flags_offset();
        let elapsed = flags + 2 * self.config.transitions.len();
        let mut fired = false;
        for index in 0..self.config.transitions.len() {
            if self.values[flags + index] > 0.0 {
                fired = true;
                self.values[elapsed + index] = 0.0;
            } else {
                self.values[elapsed + index] += 1.0;
            }
        }
        self.frame += 1;
        if self.status != 4 {
            if self.frame >= self.config.max_frames {
                self.status = 2;
            } else if !fired
                && !self
                    .config
                    .transitions
                    .iter()
                    .any(|transition| self.enabled(transition))
            {
                self.status = 3;
            } else {
                self.status = 1;
            }
        }
        self.write_metadata();
    }
}
