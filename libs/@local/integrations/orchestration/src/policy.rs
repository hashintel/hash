use core::{num::NonZero, time::Duration};

use backon::{BackoffBuilder as _, ExponentialBuilder};

/// How often a failed step is attempted, and how long to wait between attempts.
///
/// The delay after the `n`th failure is `initial_delay * multiplier^(n - 1)`, capped at
/// `max_delay`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RetryPolicy {
    pub max_attempts: NonZero<u32>,
    pub initial_delay: Duration,
    pub max_delay: Duration,
    pub multiplier: NonZero<u16>,
}

impl RetryPolicy {
    /// Returns the delay before the next attempt after `failures` failed attempts.
    ///
    /// `backon` calculates the delay in `f32` seconds without jitter, so the same policy and
    /// failure count always give the same delay.
    #[must_use]
    pub fn delay(&self, failures: NonZero<u32>) -> Duration {
        let retries = usize::try_from(failures.get() - 1).unwrap_or(usize::MAX);
        ExponentialBuilder::new()
            .with_min_delay(self.initial_delay)
            .with_max_delay(self.max_delay)
            .with_factor(f32::from(self.multiplier.get()))
            .without_max_times()
            .build()
            .nth(retries)
            .map_or(self.max_delay, |delay| delay.min(self.max_delay))
    }
}

#[cfg(test)]
mod tests {
    use core::{num::NonZero, time::Duration};

    use rstest::rstest;

    use crate::RetryPolicy;

    fn policy(initial_delay: Duration) -> RetryPolicy {
        RetryPolicy {
            max_attempts: NonZero::new(50).expect("fifty should be nonzero"),
            initial_delay,
            max_delay: Duration::from_mins(10),
            multiplier: NonZero::new(2).expect("two should be nonzero"),
        }
    }

    #[rstest]
    #[case::first(Duration::from_secs(30), Duration::from_secs(30))]
    #[case::initial_above_maximum(Duration::from_mins(20), Duration::from_mins(10))]
    fn retry_policy_delay(#[case] initial_delay: Duration, #[case] expected: Duration) {
        assert_eq!(
            policy(initial_delay).delay(NonZero::<u32>::MIN),
            expected,
            "the first delay should be the initial delay, capped at the maximum"
        );
    }
}
