use core::time::Duration;

use time::UtcDateTime;

/// A point in time, recorded in [`RunEvent::StepFailed`].
///
/// [`RunEvent::StepFailed`]: crate::RunEvent::StepFailed
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Timestamp(UtcDateTime);

impl Timestamp {
    #[must_use]
    pub const fn new(time: UtcDateTime) -> Self {
        Self(time)
    }

    #[must_use]
    pub const fn get(self) -> UtcDateTime {
        self.0
    }

    #[must_use]
    pub fn saturating_add(self, duration: Duration) -> Self {
        let duration = time::Duration::try_from(duration).unwrap_or(time::Duration::MAX);
        Self(self.0.saturating_add(duration))
    }
}
