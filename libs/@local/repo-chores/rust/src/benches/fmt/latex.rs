use core::{fmt, fmt::Write as _};

use crate::benches::fmt::{Braced, Color, Colored, Duration, Unit};

pub(crate) trait Latex {
    /// Formats the value in LaTeX.
    ///
    /// # Errors
    ///
    /// Returns an error if the value could not be formatted.
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result;
}

impl<T> Latex for Colored<T>
where
    T: Latex,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let color = match self.color {
            Color::Red => "red",
            Color::Green => "lightgreen",
            Color::Gray => "gray",
        };
        write!(fmt, "{{\\color{{{color}}}")?;
        self.value.fmt(fmt)?;
        fmt.write_char('}')
    }
}

impl<T> Latex for Braced<T>
where
    T: Latex,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("\\left(")?;
        self.value.fmt(fmt)?;
        fmt.write_str("\\right)")
    }
}

impl Latex for Unit {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let symbol = match self {
            Self::Picoseconds => "ps",
            Self::Nanoseconds => "ns",
            Self::Microseconds => "\u{3bc}s",
            Self::Milliseconds => "ms",
            Self::Seconds => "s",
            Self::Percent => "\\\\%",
        };
        write!(fmt, "\\mathrm{{{symbol}}}")
    }
}

impl Latex for Duration {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.amount < 1.0 {
            write!(fmt, "{:.3} ", self.amount)?;
        } else if self.amount < 10.0 {
            write!(fmt, "{:.2} ", self.amount)?;
        } else if self.amount < 100.0 {
            write!(fmt, "{:.1} ", self.amount)?;
        } else {
            write!(fmt, "{:.0} ", self.amount)?;
        }
        self.unit.fmt(fmt)
    }
}
