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
        let multiplier = self.multiplier.get();
        let mut delay = self.initial_delay;
        for _ in 1..failures.get() {
            // Each pass at least doubles a nonzero delay, so the loop ends within about 100 passes.
            if multiplier == 1 || delay.is_zero() || delay >= self.max_delay {
                break;
            }
            delay = delay.saturating_mul(multiplier);
        }
        delay.min(self.max_delay)
    }
}

#[cfg(test)]
mod tests {
    use core::{num::NonZero, time::Duration};

    use rstest::rstest;

    use crate::RetryPolicy;

    #[rstest]
    #[case::first(Duration::from_secs(30), 1, Duration::from_secs(30))]
    #[case::second(Duration::from_secs(30), 2, Duration::from_mins(1))]
    #[case::capped(Duration::from_secs(30), 6, Duration::from_mins(10))]
    #[case::many_failures(Duration::from_secs(30), 40, Duration::from_mins(10))]
    #[case::small_delay_many_failures(Duration::from_nanos(1), 33, Duration::from_nanos(1 << 32))]
    #[case::zero_delay(Duration::ZERO, 40, Duration::ZERO)]
    fn retry_policy_delay(
        #[case] initial_delay: Duration,
        #[case] failures: u32,
        #[case] expected: Duration,
    ) {
        let policy = RetryPolicy {
            max_attempts: NonZero::new(50).expect("fifty should be nonzero"),
            initial_delay,
            max_delay: Duration::from_mins(10),
            multiplier: NonZero::new(2).expect("two should be nonzero"),
        };
        let failures = NonZero::new(failures).expect("failures should be nonzero");
        assert_eq!(
            policy.delay(failures),
            expected,
            "the delay should grow by the multiplier up to the maximum"
        );
    }
}
