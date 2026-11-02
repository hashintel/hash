use core::{num::NonZero, time::Duration};

/// How often a failed step is attempted, and how long to wait between attempts.
///
/// The delay after the `n`th failure is `initial_delay * multiplier^(n - 1)`, capped at
/// `max_delay`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RetryPolicy {
    pub max_attempts: NonZero<u32>,
    pub initial_delay: Duration,
    pub max_delay: Duration,
    pub multiplier: NonZero<u32>,
}

impl RetryPolicy {
    /// Returns the delay before the next attempt after `failures` failed attempts.
    #[must_use]
    pub fn delay(&self, failures: NonZero<u32>) -> Duration {
        self.multiplier
            .get()
            .checked_pow(failures.get() - 1)
            .and_then(|factor| self.initial_delay.checked_mul(factor))
            .map_or(self.max_delay, |delay| delay.min(self.max_delay))
    }
}

#[cfg(test)]
mod tests {
    use core::{num::NonZero, time::Duration};

    use rstest::rstest;

    use crate::RetryPolicy;

    const POLICY: RetryPolicy = RetryPolicy {
        max_attempts: NonZero::new(5).expect("five should be nonzero"),
        initial_delay: Duration::from_secs(30),
        max_delay: Duration::from_mins(10),
        multiplier: NonZero::new(2).expect("two should be nonzero"),
    };

    #[rstest]
    #[case::first(1, Duration::from_secs(30))]
    #[case::second(2, Duration::from_mins(1))]
    #[case::capped(6, Duration::from_mins(10))]
    #[case::overflowing_factor(40, Duration::from_mins(10))]
    fn retry_policy_delay(#[case] failures: u32, #[case] expected: Duration) {
        let failures = NonZero::new(failures).expect("failures should be nonzero");
        assert_eq!(
            POLICY.delay(failures),
            expected,
            "the delay should grow by the multiplier up to the maximum"
        );
    }
}
