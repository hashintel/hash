//! Fail-closed release evidence for immutable generation candidates.

mod error;
mod gate;

pub(crate) use self::{
    error::ReleaseGateError,
    gate::{GateId, GateOutcome, GateReport, GatedRelease, ReleaseHead},
};

#[cfg(test)]
mod tests;
