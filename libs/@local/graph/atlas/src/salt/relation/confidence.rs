//! Link-confidence algebra: scores, provenance bits, and the effective confidence.
//!
//! The dataset stream attaches up to three scores to one link instance ([`RelationConfidence`]);
//! [`RelationConfidence::effective`] combines them into the per-instance factor `c = c_link ·
//! √(c_source · c_target)` with missing scores contributing the neutral factor 1, and [`Scored`]
//! retains which scores were present, down to its artifact wire encoding.

use crate::math::UnitFraction;

/// Presence bits of the three scores behind one effective confidence.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct Scored(u8);

impl Scored {
    /// Every speakable presence bit.
    const ALL: Self = Self::LINK | Self::SOURCE | Self::TARGET;
    /// No score present.
    pub(crate) const EMPTY: Self = Self(0);
    /// The link score's presence bit.
    pub(crate) const LINK: Self = Self(1 << 0);
    /// The source-attachment score's presence bit.
    pub(crate) const SOURCE: Self = Self(1 << 1);
    /// The target-attachment score's presence bit.
    pub(crate) const TARGET: Self = Self(1 << 2);

    /// Returns the presence bits as their wire encoding.
    #[inline]
    #[must_use]
    pub(crate) const fn to_bits(self) -> u8 {
        self.0
    }

    /// Reassembles presence bits from their wire encoding.
    ///
    /// Returns [`None`] when `bits` sets a bit outside the three flags.
    #[inline]
    #[must_use]
    pub(crate) const fn from_bits(bits: u8) -> Option<Self> {
        if bits & !Self::ALL.to_bits() != 0 {
            return None;
        }

        Some(Self(bits))
    }
}

const impl core::ops::BitOr for Scored {
    type Output = Self;

    /// Unions the presence bits.
    #[inline]
    fn bitor(self, rhs: Self) -> Self {
        Self(self.0 | rhs.0)
    }
}

/// Confidence scores attached to one link instance.
///
/// Each score lies in `0.0..=1.0`, the dataset stream's confidence contract. `None` means unscored,
/// which [`effective`](Self::effective) treats as the neutral factor 1 while retaining the
/// scored/unscored distinction.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct RelationConfidence {
    /// The store's confidence in the link itself.
    pub link: Option<UnitFraction>,
    /// The store's confidence in the link's attachment to its source.
    pub source: Option<UnitFraction>,
    /// The store's confidence in the link's attachment to its target.
    pub target: Option<UnitFraction>,
}

impl RelationConfidence {
    /// Combines the three scores into one effective confidence.
    ///
    /// The value is `link · √(source · target)` with missing scores contributing the neutral factor
    /// 1. The provenance bits record which scores were present.
    #[must_use]
    pub(crate) fn effective(self) -> EffectiveConfidence {
        let scored = self.link.map_or(Scored::EMPTY, |_| Scored::LINK)
            | self.source.map_or(Scored::EMPTY, |_| Scored::SOURCE)
            | self.target.map_or(Scored::EMPTY, |_| Scored::TARGET);

        let link = self.link.unwrap_or(UnitFraction::ONE);
        let source = self.source.unwrap_or(UnitFraction::ONE);
        let target = self.target.unwrap_or(UnitFraction::ONE);

        EffectiveConfidence {
            value: link * (source * target).sqrt(),
            scored,
        }
    }
}

/// One link instance's combined confidence and its score provenance.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct EffectiveConfidence {
    value: UnitFraction,
    scored: Scored,
}

impl EffectiveConfidence {
    /// Reassembles a confidence from its combined value and provenance bits.
    ///
    /// The domain rides in the fraction, so construction validates nothing.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: UnitFraction, scored: Scored) -> Self {
        Self { value, scored }
    }

    /// Returns the combined confidence, in `0.0..=1.0`.
    #[inline]
    #[must_use]
    pub(crate) const fn value(self) -> UnitFraction {
        self.value
    }

    /// Returns the presence bits of the three source scores.
    #[inline]
    #[must_use]
    pub(crate) const fn scored(self) -> Scored {
        self.scored
    }
}

#[cfg(test)]
mod tests {
    use super::{RelationConfidence, Scored};
    use crate::math::{UnitFraction, unit_fraction};

    #[test]
    fn effective_confidence_combines_scores_exactly() {
        // 0.5 · √(0.25 · 0.25): every factor is a power of two, so the product 0.125 is exact.
        let confidence = RelationConfidence {
            link: Some(unit_fraction!(0.5)),
            source: Some(unit_fraction!(0.25)),
            target: Some(unit_fraction!(0.25)),
        };
        let effective = confidence.effective();
        assert_eq!(effective.value(), unit_fraction!(0.125));
        assert_eq!(
            effective.scored(),
            Scored::LINK | Scored::SOURCE | Scored::TARGET
        );
    }

    #[test]
    fn unscored_confidences_are_neutral_with_provenance() {
        let effective = RelationConfidence::default().effective();
        assert_eq!(effective.value(), UnitFraction::ONE);
        assert_eq!(effective.scored(), Scored::EMPTY);

        let partial = RelationConfidence {
            link: None,
            source: Some(unit_fraction!(0.25)),
            target: None,
        }
        .effective();
        assert_eq!(partial.value(), unit_fraction!(0.5));
        assert_eq!(partial.scored(), Scored::SOURCE);
    }
}
