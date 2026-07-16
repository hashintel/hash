//! 2D vectors and fixed-size batches of them for SIMD processing.
//!
//! The scalar type is [`Vec2`]. For vectorized code, four vectors can be
//! packed into one of two batch types, both 32 bytes and both aligned for
//! [`Simd<f32, 8>`](Simd):
//!
//! - [`Vec2x4`] stores the vectors interleaved as `x0 y0 x1 y1 ...`, the natural memory order of
//!   `[Vec2; 4]`, so packing is shuffle-free and individual vectors can be indexed.
//! - [`Vec2x4T`] is the transposed layout: all four `x` components followed by all four `y`
//!   components. Use this when an operation treats the axes independently, such as distances,
//!   bounding boxes, or axis-wise clamping: [`Vec2x4T::xs`] and [`Vec2x4T::ys`] each yield a full
//!   [`Simd<f32, 4>`](Simd) lane group, so per-axis arithmetic runs without shuffles.
//!
//! Converting `[Vec2; 4]` into [`Vec2x4T`] performs the deinterleave at
//! that boundary, which is the usual tradeoff: pay the shuffle once on
//! entry and keep the hot loop axis-parallel.
//!
//! Because both batch types match [`Simd<f32, 8>`](Simd) in size and meet
//! its alignment, [`to_simd`](Vec2x4T::to_simd) and the [`From`]
//! conversions compile to a single full-width vector load or store, with no
//! intermediate copy and no split-load penalty.

use core::{ops::Index, simd::Simd};

/// A vector in 2D space with `f32` components.
///
/// A [`Vec2`] is guaranteed to have the same layout as `[f32; 2]`, with the
/// `x` component first. This makes `[Vec2; N]` bit-compatible with a flat
/// component buffer in interleaved order, and the zerocopy derives expose
/// that reinterpretation safely.
///
/// Note that [`Hash`] is derived over the raw bytes while equality follows
/// `f32` semantics, so `-0.0` and `0.0` compare equal but hash differently.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::Vec2;
///
/// let vec = Vec2::new(1.0, 2.0);
/// assert_eq!(vec.x(), 1.0);
/// assert_eq!(vec.y(), 2.0);
/// assert_eq!(vec[0], vec.x());
/// assert_eq!(vec[1], vec.y());
/// ```
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    zerocopy::ByteHash,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub struct Vec2([f32; 2]);

impl Vec2 {
    /// Creates a vector from its `x` and `y` components.
    #[must_use]
    pub const fn new(x: f32, y: f32) -> Self {
        Self([x, y])
    }

    /// Returns the `x` component.
    #[must_use]
    pub const fn x(self) -> f32 {
        self.0[0]
    }

    /// Returns the `y` component.
    #[must_use]
    pub const fn y(self) -> f32 {
        self.0[1]
    }
}

impl From<[f32; 2]> for Vec2 {
    fn from(components: [f32; 2]) -> Self {
        Self(components)
    }
}

impl From<Vec2> for [f32; 2] {
    fn from(vec: Vec2) -> Self {
        vec.0
    }
}

impl Index<usize> for Vec2 {
    type Output = f32;

    /// Returns the component at `index`, where `0` is `x` and `1` is `y`.
    ///
    /// # Panics
    ///
    /// Panics if `index >= 2`.
    fn index(&self, index: usize) -> &f32 {
        &self.0[index]
    }
}

/// Four 2D vectors packed in transposed (structure-of-arrays) order.
///
/// The eight components are stored as all four `x` values followed by all
/// four `y` values: `x0 x1 x2 x3 y0 y1 y2 y3`. The value is aligned for
/// [`Simd<f32, 8>`](Simd), and [`xs`](Self::xs) and [`ys`](Self::ys) each
/// return a full [`Simd<f32, 4>`](Simd) lane group, so axis-independent
/// arithmetic over the batch needs no shuffles.
///
/// Construct a batch from `[Vec2; 4]` via [`From`]; that conversion
/// performs the deinterleave from the vectors' natural memory order. After
/// per-axis arithmetic, reassemble a batch with
/// [`from_lanes`](Self::from_lanes).
///
/// # Examples
///
/// ```
/// # #![feature(portable_simd)]
/// use hash_graph_atlas::math::{Vec2, Vec2x4T};
///
/// let batch = Vec2x4T::from([
///     Vec2::new(1.0, 5.0),
///     Vec2::new(2.0, 6.0),
///     Vec2::new(3.0, 7.0),
///     Vec2::new(4.0, 8.0),
/// ]);
///
/// assert_eq!(batch.xs().to_array(), [1.0, 2.0, 3.0, 4.0]);
/// assert_eq!(batch.ys().to_array(), [5.0, 6.0, 7.0, 8.0]);
///
/// // Scale both axes, then repack.
/// let scaled = Vec2x4T::from_lanes(batch.xs() * Simd::splat(2.0), batch.ys() * Simd::splat(2.0));
/// assert_eq!(scaled.get(0), Vec2::new(2.0, 10.0));
/// # use core::simd::Simd;
/// ```
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    zerocopy::ByteHash,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C, align(32))]
pub struct Vec2x4T([f32; 8]);

impl Vec2x4T {
    /// Returns the four `x` components as SIMD lanes.
    ///
    /// Lane `i` holds the `x` component of vector `i`.
    #[must_use]
    pub fn xs(self) -> Simd<f32, 4> {
        Simd::from_slice(&self.0[..4])
    }

    /// Returns the four `y` components as SIMD lanes.
    ///
    /// Lane `i` holds the `y` component of vector `i`.
    #[must_use]
    pub fn ys(self) -> Simd<f32, 4> {
        Simd::from_slice(&self.0[4..])
    }

    /// Assembles a batch from one SIMD lane group per axis.
    ///
    /// Lane `i` of `xs` and `ys` becomes vector `i`. This is the natural
    /// way to store results back after per-axis arithmetic.
    #[must_use]
    pub const fn from_lanes(xs: Simd<f32, 4>, ys: Simd<f32, 4>) -> Self {
        let [x0, x1, x2, x3] = xs.to_array();
        let [y0, y1, y2, y3] = ys.to_array();

        Self([x0, x1, x2, x3, y0, y1, y2, y3])
    }

    /// Returns the vector at `index`.
    ///
    /// This gathers the `x` and `y` components from their axis groups. If
    /// you index vectors more often than you operate per-axis, store
    /// [`Vec2x4`] instead.
    ///
    /// # Panics
    ///
    /// Panics if `index >= 4`.
    #[must_use]
    pub const fn get(self, index: usize) -> Vec2 {
        Vec2::new(self.0[index], self.0[index + 4])
    }

    /// Returns all eight components as a single SIMD vector.
    ///
    /// The lane order is the memory order: `x0 x1 x2 x3 y0 y1 y2 y3`. This
    /// compiles to a single full-width vector load.
    #[must_use]
    pub const fn to_simd(self) -> Simd<f32, 8> {
        Simd::from_array(self.0)
    }
}

impl From<[Vec2; 4]> for Vec2x4T {
    /// Deinterleaves four vectors into structure-of-arrays order.
    fn from(vecs: [Vec2; 4]) -> Self {
        let [
            Vec2([x0, y0]),
            Vec2([x1, y1]),
            Vec2([x2, y2]),
            Vec2([x3, y3]),
        ] = vecs;

        Self([x0, x1, x2, x3, y0, y1, y2, y3])
    }
}

impl From<Simd<f32, 8>> for Vec2x4T {
    /// Reinterprets eight lanes in `x0 x1 x2 x3 y0 y1 y2 y3` order.
    fn from(lanes: Simd<f32, 8>) -> Self {
        Self(lanes.to_array())
    }
}

impl From<Vec2x4T> for Simd<f32, 8> {
    fn from(batch: Vec2x4T) -> Self {
        batch.to_simd()
    }
}

/// Four 2D vectors packed in natural (array-of-structures) order.
///
/// The vectors are stored whole and interleaved, matching the memory layout
/// of `[Vec2; 4]`: `x0 y0 x1 y1 x2 y2 x3 y3`. Packing from `[Vec2; 4]` is
/// therefore shuffle-free, individual vectors can be indexed directly, and
/// the value is aligned for [`Simd<f32, 8>`](Simd). Use this layout when
/// operations treat vectors as whole units; for axis-independent
/// arithmetic, convert to [`Vec2x4T`].
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::{Vec2, Vec2x4};
///
/// let batch = Vec2x4::from([
///     Vec2::new(1.0, 5.0),
///     Vec2::new(2.0, 6.0),
///     Vec2::new(3.0, 7.0),
///     Vec2::new(4.0, 8.0),
/// ]);
///
/// assert_eq!(batch[2], Vec2::new(3.0, 7.0));
/// ```
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    zerocopy::ByteHash,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C, align(32))]
pub struct Vec2x4([Vec2; 4]);

impl Vec2x4 {
    /// Returns the vector at `index`.
    ///
    /// # Panics
    ///
    /// Panics if `index >= 4`.
    #[must_use]
    pub const fn get(self, index: usize) -> Vec2 {
        self.0[index]
    }

    /// Returns all eight components as a single SIMD vector.
    ///
    /// The lane order is the memory order: `x0 y0 x1 y1 x2 y2 x3 y3`. This
    /// compiles to a single full-width vector load.
    #[must_use]
    pub const fn to_simd(self) -> Simd<f32, 8> {
        let [
            Vec2([x0, y0]),
            Vec2([x1, y1]),
            Vec2([x2, y2]),
            Vec2([x3, y3]),
        ] = self.0;

        Simd::from_array([x0, y0, x1, y1, x2, y2, x3, y3])
    }
}

impl From<[Vec2; 4]> for Vec2x4 {
    /// Packs four vectors in their natural interleaved order.
    fn from(vecs: [Vec2; 4]) -> Self {
        Self(vecs)
    }
}

impl From<Vec2x4> for [Vec2; 4] {
    fn from(batch: Vec2x4) -> Self {
        batch.0
    }
}

impl From<Simd<f32, 8>> for Vec2x4 {
    /// Reinterprets eight lanes in `x0 y0 x1 y1 x2 y2 x3 y3` order.
    fn from(lanes: Simd<f32, 8>) -> Self {
        let [x0, y0, x1, y1, x2, y2, x3, y3] = lanes.to_array();

        Self([
            Vec2([x0, y0]),
            Vec2([x1, y1]),
            Vec2([x2, y2]),
            Vec2([x3, y3]),
        ])
    }
}

impl From<Vec2x4> for Simd<f32, 8> {
    fn from(batch: Vec2x4) -> Self {
        batch.to_simd()
    }
}

impl From<Vec2x4> for Vec2x4T {
    /// Deinterleaves an array-of-structures batch by axis.
    fn from(batch: Vec2x4) -> Self {
        Self::from(batch.0)
    }
}

impl From<Vec2x4T> for Vec2x4 {
    /// Interleaves a structure-of-arrays batch back into whole vectors.
    fn from(batch: Vec2x4T) -> Self {
        let [x0, x1, x2, x3, y0, y1, y2, y3] = batch.0;

        Self([
            Vec2([x0, y0]),
            Vec2([x1, y1]),
            Vec2([x2, y2]),
            Vec2([x3, y3]),
        ])
    }
}

impl Index<usize> for Vec2x4 {
    type Output = Vec2;

    /// Returns a reference to the vector at `index`.
    ///
    /// # Panics
    ///
    /// Panics if `index >= 4`.
    fn index(&self, index: usize) -> &Vec2 {
        &self.0[index]
    }
}

// Both batch layouts must be usable as backing storage for `Simd<f32, 8>`:
// identical size, and at least its alignment. `Simd`'s alignment is
// target-dependent (it can be below 32 on targets without 256-bit vectors),
// so the alignment check is a lower bound rather than an equality.
const _: () = assert!(size_of::<Vec2x4T>() == size_of::<Simd<f32, 8>>());
const _: () = assert!(size_of::<Vec2x4>() == size_of::<Simd<f32, 8>>());
const _: () = assert!(align_of::<Vec2x4T>() >= align_of::<Simd<f32, 8>>());
const _: () = assert!(align_of::<Vec2x4>() >= align_of::<Simd<f32, 8>>());
