//! Reports over the published projector, observers of the placement rather than participants.
//!
//! Everything under this module reads published generations and measures the projector's
//! behaviour after the fact. Nothing here trains the projector or stages an artifact.
//!
//! [`replay`] measures how the deployed publish path serves arrivals: nodes a later generation
//! fitted that an earlier generation never saw.

pub(crate) mod replay;
