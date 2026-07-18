use alloc::alloc::{Allocator, Global};
use core::{fmt, fmt::Display};

use super::phrase::Phrase;

/// One source type's allowed target types and per-source cardinality.
pub(crate) struct EndpointConstraint<'text, A: Allocator = Global> {
    pub source: Phrase<'text>,
    pub targets: Vec<Phrase<'text>, A>,
    minimum_targets: Option<usize>,
    maximum_targets: Option<usize>,
}

impl<'text, A: Allocator> EndpointConstraint<'text, A> {
    /// Validates the per-source cardinality range.
    ///
    /// `None` reports a minimum that exceeds the maximum.
    #[must_use]
    pub(crate) fn new(
        source: Phrase<'text>,
        targets: Vec<Phrase<'text>, A>,
        minimum_targets: Option<usize>,
        maximum_targets: Option<usize>,
    ) -> Option<Self> {
        if let (Some(minimum), Some(maximum)) = (minimum_targets, maximum_targets)
            && minimum > maximum
        {
            return None;
        }

        Some(Self {
            source,
            targets,
            minimum_targets,
            maximum_targets,
        })
    }

    /// Reports whether the constraint allows at most one target per
    /// source.
    ///
    /// A lone simple pair carries no association a paired block could
    /// disambiguate, so the card renders it through the independent
    /// source and target sections instead.
    pub(super) const fn is_simple_pair(&self) -> bool {
        self.minimum_targets.is_none() && matches!(self.maximum_targets, None | Some(1))
    }
}

impl<A: Allocator> Display for EndpointConstraint<'_, A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self {
            source,
            targets,
            minimum_targets,
            maximum_targets,
        } = self;

        Display::fmt(source, fmt)?;
        fmt.write_str(" -> ")?;

        match targets.as_slice() {
            [] => fmt.write_str("any target type")?,
            [only] => Display::fmt(only, fmt)?,
            targets => {
                fmt.write_str("one of: ")?;
                for (index, target) in targets.iter().enumerate() {
                    if index > 0 {
                        fmt.write_str(" | ")?;
                    }
                    Display::fmt(target, fmt)?;
                }
            }
        }

        match (minimum_targets, maximum_targets) {
            (None, None) => Ok(()),
            (None, Some(maximum)) => write!(fmt, " [targets per source: <= {maximum}]"),
            (Some(minimum), None) => write!(fmt, " [targets per source: >= {minimum}]"),
            (Some(minimum), Some(maximum)) if minimum == maximum => {
                write!(fmt, " [targets per source: exactly {minimum}]")
            }
            // "(inclusive)" disambiguates against Rust's exclusive `a..b`
            // range notation.
            (Some(minimum), Some(maximum)) => {
                write!(
                    fmt,
                    " [targets per source: {minimum}..{maximum} (inclusive)]"
                )
            }
        }
    }
}

/// The direction described by a card.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Direction {
    Symmetric,
    SourceToTarget,
}

impl Display for Direction {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Symmetric => fmt.write_str("symmetric"),
            Self::SourceToTarget => fmt.write_str("source -> target"),
        }
    }
}

/// The shared constraint vocabulary.
///
/// `None` means the datasource does not record that fact and renders as
/// "not recorded"; `Some(false)` is a recorded negative assertion. Cards
/// report the ontology as-is.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct Constraints {
    pub symmetric: Option<bool>,
    pub transitive: Option<bool>,
    pub singleton: Option<bool>,
    pub distinct: Option<bool>,
    pub direction: Direction,
}

impl Display for Constraints {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let &Self {
            symmetric,
            transitive,
            singleton,
            distinct,
            direction,
        } = self;

        let flag = |flag: Option<bool>| {
            fmt::from_fn(move |fmt| {
                fmt.write_str(match flag {
                    Some(true) => "yes",
                    Some(false) => "no",
                    None => "not recorded",
                })
            })
        };

        writeln!(fmt, "Constraints:")?;
        writeln!(fmt, "  - symmetric? {}", flag(symmetric))?;
        writeln!(fmt, "  - transitive? {}", flag(transitive))?;
        writeln!(fmt, "  - single value? {}", flag(singleton))?;
        writeln!(fmt, "  - distinct values? {}", flag(distinct))?;
        writeln!(fmt, "  - direction: {direction}")
    }
}
