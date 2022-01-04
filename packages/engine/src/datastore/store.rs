use std::sync::Arc;

use super::{
    prelude::*,
    table::{context::ExContext, state::ExState},
};
use crate::{
    config::{ExperimentConfig, SimulationConfig},
    SimRunConfig,
};

/// The underlying state of a simulation run.
pub struct Store {
    state: Option<State>,
    context: Option<Context>,
    // TODO: all three of these are unused, are they necessary?
    _shared_store: Arc<SharedStore>,
    _global_config: Arc<ExperimentConfig>,
    _local_config: Arc<SimulationConfig>,
}

impl Store {
    pub fn new_uninitialized(shared_store: Arc<SharedStore>, config: &SimRunConfig) -> Store {
        Store {
            state: None,
            context: None,
            _shared_store: shared_store,
            _global_config: config.exp.clone(),
            _local_config: config.sim.clone(),
        }
    }

    pub fn take(&mut self) -> Result<(State, Context)> {
        Ok((
            self.state
                .take()
                .ok_or_else(|| Error::from("Expected state"))?,
            self.context
                .take()
                .ok_or_else(|| Error::from("Expected context"))?,
        ))
    }

    pub fn take_upgraded(&mut self) -> Result<(ExState, ExContext)> {
        let (state, context) = self.take()?;
        Ok((state.upgrade(), context.upgrade()))
    }

    pub fn set(&mut self, state: State, context: Context) {
        self.state = Some(state);
        self.context = Some(context);
    }
}
