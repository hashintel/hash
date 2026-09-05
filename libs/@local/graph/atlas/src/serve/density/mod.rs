//! The scope-local delivery cut.
//!
//! A public density band over one authorized view's occupancy.
//!
//! A tile's delivery cut is `d(z) = z + m + k`, where `m` is the generation's span exponent and `k`
//! the offset this module resolves. The recorded schedule fixes `m`. `k` is the one degree of
//! freedom a restricted view has, and it decides how deep that view's tiles reach.
//!
//! `k` reads the authorized view and public constants, and nothing else. An offset derived from a
//! hidden row (a corpus-wide count, an unmasked bucket length, or a per-tile occupancy statistic)
//! would put the mask's own contents back on the wire as delivery depth. A client cannot see the
//! hidden rows, but it can see how deep the server went to accommodate them. Delivery depth is
//! therefore a public decision over the authorized view `V` and never an inheritance from the
//! corpus.
//!
//! The rule is a public inclusive band `[L, U]` over `C(m + k, V)`, the number of distinct
//! depth-`(m + k)` Morton cells `V` occupies. [`DensityPolicy::resolve`] chooses the offset whose
//! count lies nearest the band, coarsest on a tie. The band is a target rather than a promise:
//! occupied-cell counts step by whole subdivisions, so a coarse step can jump the band and the
//! nearest result may sit below or above it. Counts across scopes need not agree.
//!
//! The schedule determines the candidate offsets rather than any configuration. `k` runs over
//! `0..=ceiling`, where the ceiling is the room the recorded schedule leaves inside the 32
//! subdivisions a 64-bit Morton key resolves, `32 - (m + z_max)`. The cut applies at every zoom, so
//! it is the deepest bucket `d(z_max)` that spends the key width, and `0` - the generation's own
//! schedule - is always available. The ceiling binds on clustering rather than on scale: a small,
//! densely-clustered view never reaches the band, so `resolve` runs to its saturation depth, which
//! sits as deep as the fit separates points - past the ceiling at default settings. A filtered
//! scope is exactly that shape.
//!
//! Occupancy travels as [`ViewOccupancy`], a typed aggregate of `V`, rather than as a precomputed
//! number, so a review can vary what a resolution reads. An opaque scalar would hide exactly the
//! provenance a channel argument turns on.
//!
//! # The aggregate
//!
//! `C(·, V)` at every depth, `Q(V) = C(32, V)` - the distinct complete keys - and `d_sat(V) = min {
//! d | C(d, V) = Q(V) }` all fall out of one pass over the view's sorted keys.
//!
//! Keys share a depth-`d` cell exactly when their leading `2d` bits agree, so distinct keys `a ≠ b`
//! first separate at depth `⌊lz(a ⊕ b) / 2⌋ + 1`, where `lz` counts leading zero bits. Sortedness
//! makes adjacent pairs sufficient, because when every adjacent distinct pair separates at or above
//! depth `d`, so does every pair. One pass therefore histograms the adjacent separation depths, and
//! `C(d, V) = 1 + #{ separations ≤ d }` for a non-empty view - the histogram's running sum, which
//! is what the aggregate stores.
//!
//! The stored form is the count profile alone. A row count is not an input any policy reads, so the
//! aggregate does not carry one. Views whose profiles agree are one value, and a resolution returns
//! the same offset for both.
//!
//! The module is crate-internal. Its examples carry `ignore` and spell each call as an in-crate
//! caller writes it, and the module's tests assert every property the examples show.
#![expect(
    clippy::empty_enums,
    reason = "zerocopy's FromBytes derive expands to an empty enum for its validation machinery"
)]

#[cfg(test)]
mod tests;

use core::{error::Error, fmt, num::NonZero};

use crate::{
    math::Log2,
    morton::{Depth, MortonKey},
};

/// The inclusive occupied-cell band a scope's delivery aims for.
///
/// Both bounds are public configured constants, positive and ordered `lower ≤ upper`. A count
/// inside the band lies at distance zero, and outside it the distance is the shortfall or the
/// excess.
///
/// Unconfigured, the band runs 2,000 through 4,000 occupied cells.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct DensityBand {
    lower: NonZero<u64>,
    upper: NonZero<u64>,
}

impl DensityBand {
    /// Validates a configured band.
    ///
    /// Returns [`None`] when `upper` lies below `lower`, a band that admits no count.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// use core::num::NonZero;
    ///
    /// let band = DensityBand::new(
    ///     NonZero::new(2_000).expect("2,000 is positive"),
    ///     NonZero::new(4_000).expect("4,000 is positive"),
    /// )
    /// .expect("2,000 ≤ 4,000");
    ///
    /// assert_eq!(band.distance(3_000), 0);
    /// assert_eq!(band.distance(1_500), 500);
    /// assert_eq!(band.distance(4_500), 500);
    /// ```
    #[must_use]
    #[cfg(test)] // The density and manifest tests configure bands directly.
    pub(crate) const fn new(lower: NonZero<u64>, upper: NonZero<u64>) -> Option<Self> {
        if upper.get() < lower.get() {
            return None;
        }

        Some(Self { lower, upper })
    }

    /// Returns `count`'s distance to the band, zero inside it.
    #[must_use]
    pub(crate) const fn distance(self, count: u64) -> u64 {
        if count < self.lower.get() {
            return self.lower.get() - count;
        }

        if count > self.upper.get() {
            return count - self.upper.get();
        }

        0
    }
}

const impl Default for DensityBand {
    fn default() -> Self {
        Self {
            lower: NonZero::new(2_000).expect("2,000 is positive"),
            upper: NonZero::new(4_000).expect("4,000 is positive"),
        }
    }
}

/// One delivery-cut offset, the depth every zoom's cut gains for one scope.
///
/// A density policy resolves the offset at a session's bootstrap and a sealed authority token
/// carries it, so a session serves at one delivery depth for as long as its client holds a token. A
/// view re-bound to another filter keeps that depth unless the new view resolves coarser, which
/// clamps it down - see [`DensityPolicy::rebind`]. Production construction is [`Self::ZERO`], a
/// policy's resolution or rebind, or the authenticated read of a sealed token, so the public-band
/// rule fixes every served offset and a client cannot forge one past the seal.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct CutOffset(u8);

impl CutOffset {
    /// The generation's own schedule.
    ///
    /// Every zoom keeps its recorded cut. Every schedule leaves room for this offset, so it is the
    /// resolution of a view with no occupancy to aim with.
    pub(crate) const ZERO: Self = Self(0);

    /// Returns the offset.
    #[must_use]
    pub(crate) const fn get(self) -> u8 {
        self.0
    }

    /// Wraps a raw offset, for fixtures alone.
    #[cfg(test)]
    pub(crate) const fn new(offset: u8) -> Self {
        Self(offset)
    }
}

/// A generation whose recorded schedule leaves no delivery-cut offset to resolve.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum DensityPolicyError {
    /// The recorded schedule already exceeds the key width, so no scope cascade deepens it.
    Schedule {
        /// The schedule's span exponent.
        span: u8,
        /// The schedule's deepest served zoom.
        max_tile_depth: u8,
    },
    /// The generation's root tile is its deepest.
    ///
    /// A terminal root is the catch-all bucket, and deepening a catch-all delivers no proportional
    /// view.
    TerminalRoot,
}

impl fmt::Display for DensityPolicyError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Schedule {
                span,
                max_tile_depth,
            } => write!(
                fmt,
                "the schedule's deepest bucket {max_tile_depth} + {span} already exceeds the 32 \
                 subdivisions a Morton key resolves, so no density policy applies to it"
            ),
            Self::TerminalRoot => fmt.write_str(
                "a generation whose deepest zoom is its root serves one catch-all tile, which no \
                 density policy deepens",
            ),
        }
    }
}

impl Error for DensityPolicyError {}

/// The public rule resolving one scope's delivery cut.
///
/// A policy fixes the band, the generation's span exponent, and the offset ceiling the schedule
/// leaves. Those are everything a resolution reads besides the view's own occupancy. Policies
/// differing in any of them are different public policies, and a resolved cut is comparable only
/// within one of them.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct DensityPolicy {
    band: DensityBand,
    span: Log2,
    /// The deepest offset the schedule leaves room for: `32 - (max_tile_depth + span)`.
    ceiling: u8,
}

impl DensityPolicy {
    /// Configures a policy for one generation's schedule.
    ///
    /// The recorded schedule determines the candidate offsets rather than any configuration:
    /// `0..=ceiling`, where the ceiling is what it leaves inside the 32 subdivisions a 64-bit
    /// Morton key resolves. Every candidate therefore keeps the scope cascade's deepest bucket -
    /// the sum of `max_tile_depth`, `span` and the offset - within the key width by construction,
    /// and the two failures below are the schedules where no offset at all exists.
    ///
    /// # Errors
    ///
    /// Returns [`DensityPolicyError::TerminalRoot`] when `max_tile_depth` is zero, and
    /// [`DensityPolicyError::Schedule`] when `max_tile_depth + span` already exceeds the key width.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// use crate::math::Log2;
    ///
    /// let span = Log2::new(6).expect("6 lies below the shift width");
    /// let policy = DensityPolicy::new(DensityBand::default(), span, 18)?;
    /// ```
    pub(crate) fn new(
        band: DensityBand,
        span: Log2,
        max_tile_depth: u8,
    ) -> Result<Self, DensityPolicyError> {
        if max_tile_depth == 0 {
            return Err(DensityPolicyError::TerminalRoot);
        }

        let Some(ceiling) = max_tile_depth
            .checked_add(span.get())
            .and_then(|deepest| Depth::MAX.get().checked_sub(deepest))
        else {
            return Err(DensityPolicyError::Schedule {
                span: span.get(),
                max_tile_depth,
            });
        };

        Ok(Self {
            band,
            span,
            ceiling,
        })
    }

    /// Resolves the delivery-cut offset of one authorized view.
    ///
    /// The offset in `A(V) = { k | k ≤ min(k_sat(V), ceiling) }` minimizing `(dist(C(m + k, V), [L,
    /// U]), k)`: nearest the band, coarsest on a tie. `k_sat(V) = max(0, d_sat(V) - m)` caps the
    /// search where deeper cuts stop separating rows - past saturation every occupied cell holds
    /// one key, so a deeper cut buys no occupancy and the tie-break keeps the coarser cut. The
    /// ceiling caps it where the key width runs out, and it is the binding cap exactly when a view
    /// clusters densely enough to saturate below it.
    ///
    /// Over a contiguous candidate set the saturation cap no longer decides a result on its own.
    /// Counts are constant past `d_sat`, so a deeper offset ties and the tie-break already holds
    /// the coarser cut. It stays because it makes "no resolution cuts deeper than saturation" true
    /// by construction rather than by that argument.
    ///
    /// An empty view resolves to [`CutOffset::ZERO`] through this same argmin rather than through a
    /// case of its own. It occupies no cell at any depth, so every candidate sits the same
    /// shortfall from the band and the tie-break keeps the coarsest. No hidden or corpus quantity
    /// stands in for the occupancy it lacks.
    ///
    /// The result may lie outside the band. Counts step by whole subdivisions, so a coarse step can
    /// jump the band and a small, co-located, or saturation-capped view can stay below it.
    #[must_use]
    pub(crate) fn resolve(self, occupancy: &ViewOccupancy) -> CutOffset {
        let saturation = occupancy
            .saturation_depth()
            .get()
            .saturating_sub(self.span.get());
        let limit = saturation.min(self.ceiling);

        let mut resolved = CutOffset::ZERO;
        let mut distance = u64::MAX;
        for offset in 0..=limit {
            // The ceiling bounded the search by the key width, so the fallback is unreachable; it
            // keeps the resolution total rather than fallible.
            let cut = Depth::new(self.span.get() + offset).unwrap_or(Depth::MAX);
            // Strict improvement over an ascending walk is the ordered pair's tie-break: an equal
            // distance keeps the coarser offset already held.
            let candidate = self.band.distance(occupancy.occupied_cells(cut));
            if candidate < distance {
                distance = candidate;
                resolved = CutOffset(offset);
            }
        }

        resolved
    }

    /// Rebinds a session's offset to a new view, never deepening it.
    ///
    /// A session serves at the one delivery depth its bootstrap resolved. Re-binding its view to a
    /// different filter keeps that depth instead of re-optimizing it. The detail a tile carries at
    /// a fixed zoom therefore does not move under a caller that only changed what it selects.
    ///
    /// The exception is one-way. A new view that resolves coarser than the session's offset wins,
    /// so a deep cut resolved over a sparse view never reaches a dense one whose band asks for less
    /// depth.
    ///
    /// Both directions therefore read off the minimum. A new view resolving deeper keeps the
    /// carried and coarser cut. A new view resolving coarser clamps the session down to it. An
    /// empty new view resolves [`CutOffset::ZERO`] and so clamps to zero.
    ///
    /// The result stays admissible for the new view. The candidate offsets are contiguous from
    /// zero, so a value at or below a resolvable one is itself resolvable, and the key width stays
    /// bounded because the same generation's ceiling bounded the carried value.
    #[must_use]
    pub(crate) fn rebind(self, carried: CutOffset, occupancy: &ViewOccupancy) -> CutOffset {
        carried.min(self.resolve(occupancy))
    }
}

/// The occupancy aggregate of one authorized view: every count a policy may read.
///
/// The view's occupied-cell count at every depth, from which the distinct-key count and the
/// saturation depth read off. The module doc carries the derivation and the reason the profile is
/// the whole stored form.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ViewOccupancy {
    /// Entry `d` holds `C(d, V)`: zero throughout for an empty view, and one at [`Depth::MIN`] -
    /// the whole domain - for every other.
    occupied: [u64; Self::DEPTHS],
}

impl ViewOccupancy {
    /// One entry per depth, the whole domain included.
    const DEPTHS: usize = Depth::MAX.get() as usize + 1;

    /// Aggregates the Morton keys of one authorized view.
    ///
    /// Sorts `keys` in place: the aggregate is a function of their multiset, and sorting is what
    /// lets one pass reach every depth's count.
    #[must_use]
    pub(crate) fn of(keys: &mut [MortonKey]) -> Self {
        keys.sort_unstable();

        let mut occupied = [0_u64; Self::DEPTHS];
        if keys.is_empty() {
            return Self { occupied };
        }

        let mut separations = [0_u64; Self::DEPTHS];
        for &[earlier, later] in keys.array_windows::<2>() {
            if earlier == later {
                continue;
            }

            // The keys part one level below their deepest shared grid.
            let depth = earlier.shared_depth(later).get() + 1;
            separations[usize::from(depth)] += 1;
        }

        // Every key shares the whole domain, so the profile starts at one cell and gains each
        // depth's separations.
        let mut cells = 1;
        for (count, separations) in occupied.iter_mut().zip(separations) {
            cells += separations;
            *count = cells;
        }

        Self { occupied }
    }

    /// Returns whether the view occupies nothing.
    #[must_use]
    #[cfg(test)] // The density, serve, and manifest tests assert emptiness directly.
    pub(crate) const fn is_empty(&self) -> bool {
        self.occupied[Depth::MIN.get() as usize] == 0
    }

    /// Counts the distinct depth-`depth` cells the view occupies: `C(depth, V)`.
    ///
    /// Zero for an empty view; one for every other view at [`Depth::MIN`], the whole domain.
    #[must_use]
    pub(crate) const fn occupied_cells(&self, depth: Depth) -> u64 {
        self.occupied[depth.get() as usize]
    }

    /// Counts the distinct complete keys the view carries: `Q(V) = C(32, V)`.
    #[must_use]
    pub(crate) const fn distinct_keys(&self) -> u64 {
        self.occupied_cells(Depth::MAX)
    }

    /// Returns the coarsest depth at which every distinct key occupies its own cell: `d_sat(V)`.
    ///
    /// [`Depth::MIN`] when the view carries at most one distinct key, since the whole domain
    /// already separates them - an empty view included.
    #[must_use]
    pub(crate) fn saturation_depth(&self) -> Depth {
        let saturated = self.distinct_keys();

        // The profile's deepest entry is the count itself, so the search is total; the fallback is
        // that same depth.
        Depth::all()
            .find(|&depth| self.occupied_cells(depth) == saturated)
            .unwrap_or(Depth::MAX)
    }
}
