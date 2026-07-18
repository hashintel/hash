use alloc::alloc::{Allocator, Global};
use core::{fmt, fmt::Display};

use super::phrase::Phrase;

pub(crate) struct EndpointConstraint<'text, A: Allocator = Global> {
    pub source: Phrase<'text>,
    pub targets: Vec<Phrase<'text>, A>,

    pub minimum_targets: Option<usize>,
    pub maximum_targets: Option<usize>,
}

impl<A: Allocator> Display for EndpointConstraint<'_, A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.source, fmt)?;
        fmt.write_str(" -> ")?;

        match self.targets.as_slice() {
            [] => fmt.write_str("any target type")?,
            [only] => Display::fmt(only, fmt)?,
            _ => {
                fmt.write_str("one of: ")?;
                for (index, target) in self.targets.iter().enumerate() {
                    if index > 0 {
                        fmt.write_str(" | ")?;
                    }
                    Display::fmt(target, fmt)?;
                }
            }
        }

        match (self.minimum_targets, self.maximum_targets) {
            (Some(min), None) => {
                write!(fmt, " [targets per source: >= {min}]")?;
            }
            (None, Some(max)) => {
                write!(fmt, " [targets per source: <= {max}]")?;
            }
            (Some(min), Some(max)) if min == max => {
                write!(fmt, " [targets per source: exactly {min}]")?;
            }
            (Some(min), Some(max)) => {
                write!(fmt, " [targets per source: {min}..{max} (inclusive)]")?;
            }
            (None, None) => {}
        }

        Ok(())
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum Direction {
    Symmetric,
    SourceToTarget,
}

impl Display for Direction {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Symmetric => write!(fmt, "symmetric"),
            Self::SourceToTarget => write!(fmt, "source -> target"),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct Constraints {
    pub symmetric: Option<bool>,
    pub transitive: Option<bool>,
    pub singleton: Option<bool>,
    pub unique: Option<bool>,
    pub direction: Direction,
}

impl Display for Constraints {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let &Self {
            symmetric,
            transitive,
            singleton,
            unique,
            direction,
        } = self;

        let flag_value = |flag: Option<bool>| {
            fmt::from_fn(move |fmt| match flag {
                Some(true) => write!(fmt, "yes"),
                Some(false) => write!(fmt, "no"),
                None => write!(fmt, "not recorded"),
            })
        };

        writeln!(fmt, "symmetric? {}", flag_value(symmetric))?;
        writeln!(fmt, "transitive? {}", flag_value(transitive))?;
        writeln!(fmt, "single value? {}", flag_value(singleton))?;
        writeln!(fmt, "distinct values? {}", flag_value(unique))?;
        write!(fmt, "direction? {direction}")
    }
}
