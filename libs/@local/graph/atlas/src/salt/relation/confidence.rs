//! Link-confidence algebra: scores, provenance bits, and the effective confidence.
//!
//! The dataset stream attaches up to three scores to one link instance ([`RelationConfidence`]);
//! [`RelationConfidence::effective`] combines them into the per-instance factor
//! `c = c_link · √(c_source · c_target)` with missing scores contributing the neutral factor 1,
//! and [`Scored`] retains which scores were present, down to its artifact wire encoding.

use crate::math::UnitFraction;

/// Confidence scores attached to one link instance.
///
/// Each score lies in `0.0..=1.0`, the dataset stream's confidence contract; `None` is unscored,
/// which [`effective`](Self::effective) treats as the neutral factor 1 while retaining the
/// scored/unscored distinction.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct RelationConfidence {
    /// The store's confidence in the link itself.
    pub link: Option<f32>,
    /// The store's confidence in the link's attachment to its source.
    pub source: Option<f32>,
    /// The store's confidence in the link's attachment to its target.
    pub target: Option<f32>,
}

impl RelationConfidence {
    /// Combines the three scores into one effective confidence.
    ///
    /// The value is `link · √(source · target)` with missing scores contributing the neutral
    /// factor 1; the provenance bits record which scores were present.
    #[must_use]
    pub(crate) fn effective(self) -> EffectiveConfidence {
        let scored = Scored::new(
            self.link.is_some(),
            self.source.is_some(),
            self.target.is_some(),
        );

        let link = self.link.unwrap_or(1.0);
        let source = self.source.unwrap_or(1.0);
        let target = self.target.unwrap_or(1.0);
        EffectiveConfidence {
            value: link * (source * target).sqrt(),
            scored,
        }
    }
}

/// Presence bits of the three scores behind one effective confidence.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct Scored(u8);

impl Scored {
    /// Every speakable presence bit.
    const ALL: u8 = Self::LINK | Self::SOURCE | Self::TARGET;
    const LINK: u8 = 1 << 0;
    const SOURCE: u8 = 1 << 1;
    const TARGET: u8 = 1 << 2;

    /// Returns the presence bits as their wire encoding.
    #[inline]
    #[must_use]
    pub(crate) const fn to_bits(self) -> u8 {
        self.0
    }

    /// Reassembles presence bits from their wire encoding.
    ///
    /// Returns [`None`] when a bit outside the three flags is set.
    #[inline]
    #[must_use]
    pub(crate) const fn from_bits(bits: u8) -> Option<Self> {
        if bits & !Self::ALL != 0 {
            return None;
        }

        Some(Self(bits))
    }

    /// Creates presence bits from the three score flags.
    #[inline]
    #[must_use]
    pub(crate) const fn new(link: bool, source: bool, target: bool) -> Self {
        let mut bits = 0;

        if link {
            bits |= Self::LINK;
        }
        if source {
            bits |= Self::SOURCE;
        }
        if target {
            bits |= Self::TARGET;
        }

        Self(bits)
    }

    /// Returns whether the link score was present.
    #[inline]
    #[must_use]
    pub(crate) const fn link(self) -> bool {
        self.0 & Self::LINK != 0
    }

    /// Returns whether the source-attachment score was present.
    #[inline]
    #[must_use]
    pub(crate) const fn source(self) -> bool {
        self.0 & Self::SOURCE != 0
    }

    /// Returns whether the target-attachment score was present.
    #[inline]
    #[must_use]
    pub(crate) const fn target(self) -> bool {
        self.0 & Self::TARGET != 0
    }
}

/// One link instance's combined confidence and its score provenance.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct EffectiveConfidence {
    value: f32,
    scored: Scored,
}

impl EffectiveConfidence {
    /// Validates an externally produced confidence.
    ///
    /// Returns [`None`] unless the value is finite and lies in `[0, 1]`, the range
    /// [`RelationConfidence::effective`] produces.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: f32, scored: Scored) -> Option<Self> {
        if UnitFraction::new(value as f64).is_none() {
            return None;
        }

        Some(Self { value, scored })
    }

    /// Returns the combined confidence, in `0.0..=1.0`.
    #[inline]
    #[must_use]
    pub(crate) const fn value(self) -> f32 {
        self.value
    }

    /// Returns the presence bits of the three source scores.
    #[inline]
    #[must_use]
    pub(crate) const fn scored(self) -> Scored {
        self.scored
    }
}
