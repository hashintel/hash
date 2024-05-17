pub mod latex;

#[derive(Debug, Copy, Clone)]
pub enum Color {
    Red,
    Green,
    Gray,
}

#[derive(Debug, Copy, Clone)]
pub struct Colored<T> {
    pub value: T,
    pub color: Color,
}

#[derive(Debug, Copy, Clone)]
pub struct Braced<T> {
    pub value: T,
}

#[derive(Debug, Copy, Clone)]
pub enum Unit {
    Picoseconds,
    Nanoseconds,
    Microseconds,
    Milliseconds,
    Seconds,
    Percent,
}

#[derive(Debug, Copy, Clone)]
pub struct Duration {
    pub amount: f64,
    pub unit: Unit,
}

impl Duration {
    #[must_use]
    #[expect(clippy::float_arithmetic)]
    pub fn from_nanos(nanos: f64) -> Self {
        let (amount, unit) = if nanos < 1.0 {
            (nanos * 1_000.0, Unit::Picoseconds)
        } else if nanos < 1_000.0 {
            (nanos, Unit::Nanoseconds)
        } else if nanos < 1_000_000.0 {
            (nanos / 1_000.0, Unit::Microseconds)
        } else if nanos < 1_000_000_000.0 {
            (nanos / 1_000_000.0, Unit::Milliseconds)
        } else {
            (nanos / 1_000_000_000.0, Unit::Seconds)
        };

        Self { amount, unit }
    }

    #[must_use]
    #[expect(clippy::float_arithmetic)]
    pub fn from_percent(percent: f64) -> Self {
        Self {
            amount: percent * 100.0,
            unit: Unit::Percent,
        }
    }
}
