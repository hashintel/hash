//! Occupancy-based delivery cuts that target a cell-count band within the schedule's key width.
//!
//! For a view's multiset of [`MortonKey`] values V and integer depth 0 ≤ d ≤ 32, C(d, V) counts
//! distinct leading 2d-bit prefixes. The distinct-key count is Q(V) = C(32, V), and the saturation
//! depth is dₛₐₜ(V) = min { d : C(d, V) = Q(V) }. Empty views have C(d, V) = 0 at every depth.
//! Nonempty views have C(0, V) = 1. Empty and single-distinct-key views both have dₛₐₜ(V) = 0.
//!
//! # Properties
//!
//! For every view, C(d, V) is nondecreasing in d and equals Q(V) from saturation through depth 32.
//! Duplicate keys and input order leave the profile unchanged.
//!
//! A policy has integer band bounds 1 ≤ L ≤ U ≤ 2⁶⁴ − 1. Its schedule has integer span exponent 0 ≤
//! s ≤ 63 and deepest tile zoom 0 ≤ z ≤ 32. Construction requires z > 0 and z + s ≤ 32. The offset
//! ceiling is h = 32 − (z + s). An offset 0 ≤ k ≤ h selects the view cut at depth s + k.
//!
//! For an integer count 0 ≤ c ≤ 2⁶⁴ − 1, the band distance is δ(c) = max(L − c, 0, c − U).
//! Resolution chooses the least integer k minimizing δ(C(s + k, V)) over 0 ≤ k ≤ min(max(dₛₐₜ(V) −
//! s, 0), h). Counts and distances use exact integer arithmetic, and equal distances select the
//! coarser offset. When dₛₐₜ(V) < s, the result is k = 0 and the cut at depth s is deeper than
//! saturation.
//!
//! For every carried integer offset 0 ≤ k ≤ 32, rebinding returns min(k, resolve(V)) under the new
//! policy and view.

use core::{error::Error, fmt, num::NonZero};

use hashql_core::id::{Id as _, IdArray};

use crate::{
    math::Log2,
    morton::{Depth, MortonKey, Zoom},
};

#[cfg(test)]
mod tests;

/// The inclusive occupied-cell target for a scope's delivery cut.
///
/// By default, the band runs from 2,000 through 4,000 occupied cells.
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
    /// # Example
    ///
    /// This example uses a test-only constructor on a crate-private type.
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
                "the schedule's deepest bucket {max_tile_depth} + {span} exceeds the 32 \
                 subdivisions a Morton key resolves"
            ),
            Self::TerminalRoot => fmt.write_str(
                "a generation whose deepest zoom is its root serves one catch-all tile, which no \
                 density policy deepens",
            ),
        }
    }
}

impl Error for DensityPolicyError {}

/// A band and schedule bound for choosing a scope's delivery cut.
///
/// The band, span exponent and offset ceiling determine resolution from the view's occupied-cell
/// profile.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct DensityPolicy {
    band: DensityBand,
    span: Log2,
    ceiling: Zoom,
}

impl DensityPolicy {
    /// Validates the schedule's room for density offsets.
    ///
    /// # Errors
    ///
    /// Returns [`DensityPolicyError::TerminalRoot`] when `max_tile_depth` is zero, then
    /// [`DensityPolicyError::Schedule`] when `max_tile_depth + span` exceeds 32.
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

    /// Chooses the coarsest offset minimizing distance to the target band.
    ///
    /// # Complexity
    ///
    /// Finds saturation with [`ViewOccupancy::saturation_depth`] and examines at most 33 candidate
    /// offsets, using constant additional space.
    #[must_use]
    pub(crate) fn resolve(self, occupancy: &ViewOccupancy) -> Zoom {
        // counts equal the distinct-key count from saturation onward. Later offsets have the
        // same distance, and the coarser tie-break retains the first. The saturation cap therefore
        // omits only candidates that cannot change the result. Saturation below the span admits
        // only offset zero, whose cut is already deeper than saturation.
        let saturation = occupancy.saturation_depth().zoom(self.span);
        let limit = saturation.min(self.ceiling);

        let mut resolved = Zoom::MIN;
        let mut distance = u64::MAX;

        // occupancy can plateau before increasing again: counts 2, 2, 4 reach band [3, 4] only
        // at the last offset. A non-improving offset alone therefore cannot terminate the search.
        for offset in Zoom::MIN..=limit {
            let depth = offset.saturating_depth(self.span);

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

/// Distinct occupied-cell counts at every Morton depth.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ViewOccupancy {
    occupied: IdArray<Depth, u64, { Depth::MAX.as_usize() + 1 }>,
}

impl ViewOccupancy {
    /// Builds the occupancy profile, sorting `keys` in ascending order in place.
    ///
    /// # Complexity
    ///
    /// For n keys, sorting takes O(n log n) worst-case time and allocates no heap storage.
    /// The profile pass takes O(n + 33) time with a 33-entry result and a temporary 33-entry
    /// separation table, excluding the input storage.
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

            // Adjacent distinct keys first occupy separate cells one depth below their shared
            // prefix.
            let depth = earlier.shared_depth(later).plus(1);
            separations[depth] += 1;
        }

        // Sorted prefixes form contiguous runs. Each adjacent separation starts one more occupied
        // cell at its depth and every deeper depth.
        let mut cells = 1;
        for (count, separations) in occupied.iter_mut().zip(separations) {
            cells += separations;
            *count = cells;
        }

        Self { occupied }
    }

    /// Counts the distinct depth-`depth` cells the view occupies: `C(depth, V)`.
    ///
    /// Zero for an empty view. One for every other view at [`Depth::MIN`], the whole domain.
    #[must_use]
    pub(crate) const fn occupied_cells(&self, depth: Depth) -> u64 {
        self.occupied[depth]
    }

    /// Counts the distinct complete keys the view carries: `Q(V) = C(32, V)`.
    #[must_use]
    pub(crate) const fn distinct_keys(&self) -> u64 {
        self.occupied_cells(Depth::MAX)
    }

    /// Returns the coarsest depth at which every distinct key occupies its own cell: dₛₐₜ(V).
    ///
    /// Returns [`Depth::MIN`] for empty and single-distinct-key views.
    ///
    /// # Complexity
    ///
    /// Reads the distinct-key count, then scans at most 33 profile entries, using constant
    /// additional space.
    #[must_use]
    pub(crate) fn saturation_depth(&self) -> Depth {
        let saturated = self.distinct_keys();

        // Depth::MAX always reaches the distinct-key count.
        Depth::all()
            .find(|&depth| self.occupied_cells(depth) == saturated)
            .unwrap_or(Depth::MAX)
    }
}
