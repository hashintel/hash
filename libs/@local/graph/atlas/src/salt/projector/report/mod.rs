//! Reports over the published projector, observers of the placement rather than participants.
//!
//! Everything under this module reads published generations and measures the projector's
//! behaviour after the fact, as a read-only observer of the placement.
//!
//! [`replay`] measures how the deployed publish path serves arrivals: nodes a later generation
//! fitted that an earlier generation never saw.

#[expect(
    dead_code,
    reason = "no CLI subcommand consumes the replay report, and nothing else in the crate reaches \
              this module"
)]
pub(crate) mod replay;
