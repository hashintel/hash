#![expect(
    clippy::empty_enums,
    reason = "zerocopy's FromBytes derive expands to an empty enum for its validation machinery"
)]

#[cfg(test)]
mod tests;

use core::{error::Error, fmt, num::NonZero};

use hashql_core::id::{Id as _, IdArray};

use crate::{
    math::Log2,
    morton::{Depth, MortonKey, Zoom},
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

/// A generation whose recorded schedule leaves no delivery-cut offset to resolve.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum DensityPolicyError {
    Schedule { span: Log2, max_tile_depth: Zoom },
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
    ceiling: Zoom,
}

impl DensityPolicy {
    pub(crate) fn new(
        band: DensityBand,
        span: Log2,
        max_tile_depth: Zoom,
    ) -> Result<Self, DensityPolicyError> {
        if max_tile_depth == Zoom::MIN {
            return Err(DensityPolicyError::TerminalRoot);
        }

        let Some(ceiling) = max_tile_depth.depth(span).map(Depth::ceiling) else {
            return Err(DensityPolicyError::Schedule {
                span,
                max_tile_depth,
            });
        };

        Ok(Self {
            band,
            span,
            ceiling,
        })
    }

    #[must_use]
    pub(crate) fn resolve(self, occupancy: &ViewOccupancy) -> Zoom {
        let saturation = occupancy.saturation_depth().zoom(self.span);
        let limit = saturation.min(self.ceiling);

        let mut resolved = Zoom::MIN;
        let mut distance = u64::MAX;
        for offset in Zoom::MIN..=limit {
            let depth = offset.saturating_depth(self.span);

            // tie-break through first wins. occupancy is sorted.
            let candidate = self.band.distance(occupancy.occupied_cells(depth));
            if candidate < distance {
                distance = candidate;
                resolved = offset;
            }
        }

        resolved
    }

    #[must_use]
    pub(crate) fn rebind(self, zoom: Zoom, occupancy: &ViewOccupancy) -> Zoom {
        zoom.min(self.resolve(occupancy))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ViewOccupancy {
    occupied: IdArray<Depth, u64, { Depth::MAX.as_usize() + 1 }>,
}

impl ViewOccupancy {
    #[must_use]
    pub(crate) fn of(keys: &mut [MortonKey]) -> Self {
        keys.sort_unstable();

        let mut occupied = IdArray::from_elem(0_u64);
        if keys.is_empty() {
            return Self { occupied };
        }

        let mut separations: IdArray<Depth, u64, { Depth::MAX.as_usize() + 1 }> =
            IdArray::from_elem(0_u64);
        for &[earlier, later] in keys.array_windows::<2>() {
            if earlier == later {
                continue;
            }

            // The keys part one level below their deepest shared grid.
            let depth = earlier.shared_depth(later).plus(1);
            separations[depth] += 1;
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
        self.occupied[Depth::MIN] == 0
    }

    /// Counts the distinct depth-`depth` cells the view occupies: `C(depth, V)`.
    ///
    /// Zero for an empty view; one for every other view at [`Depth::MIN`], the whole domain.
    #[must_use]
    pub(crate) const fn occupied_cells(&self, depth: Depth) -> u64 {
        self.occupied[depth]
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
