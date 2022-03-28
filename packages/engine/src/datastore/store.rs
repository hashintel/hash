use crate::datastore::{
    error::{Error, Result},
    table::{context::Context, state::State},
};

/// The underlying state of a simulation run.
pub struct Store {
    state: Option<State>,
    context: Option<Context>,
}

impl Store {
    pub fn new_uninitialized() -> Store {
        Store {
            state: None,
            context: None,
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

    pub fn set(&mut self, state: State, context: Context) {
        self.state = Some(state);
        self.context = Some(context);
    }
}
