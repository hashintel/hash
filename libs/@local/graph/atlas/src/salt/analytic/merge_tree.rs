#![expect(
    clippy::little_endian_bytes,
    reason = "merge-tree identities require canonical little-endian integer and float encodings"
)]

use super::{
    allocation::{collect_exact, empty, filled},
    error::AnalyticError,
    raster::DensityRaster,
};
use crate::salt::hash::{ContentHash, ContentHasher};

const INACTIVE: usize = usize::MAX;

/// Superlevel-sweep thresholds for analytic persistence.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct MergeTreeConfig {
    pub floor_fraction: f64,
    pub persistence_fraction: f64,
}

impl Default for MergeTreeConfig {
    fn default() -> Self {
        Self {
            floor_fraction: 0.005,
            persistence_fraction: 0.05,
        }
    }
}

/// One persistent component born at a peak and killed at a merge level.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct PersistenceLeaf {
    pub id: u64,
    pub parent: Option<u64>,
    pub representative_pixel: usize,
    pub birth: f64,
    pub death: f64,
}

impl PersistenceLeaf {
    /// Returns `birth - death`.
    #[must_use]
    #[inline]
    pub(crate) fn persistence(self) -> f64 {
        self.birth - self.death
    }
}

/// Persistent leaves from a deterministic density superlevel sweep.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct MergeTree {
    density_maximum: f64,
    leaves: Vec<PersistenceLeaf>,
}

impl MergeTree {
    /// Borrows persistent leaves in deterministic death order.
    #[must_use]
    #[inline]
    pub(crate) fn leaves(&self) -> &[PersistenceLeaf] {
        &self.leaves
    }

    /// Returns the sum of leaf persistence in density units.
    #[must_use]
    pub(crate) fn total_persistence(&self) -> f64 {
        self.leaves.iter().map(|leaf| leaf.persistence()).sum()
    }

    /// Returns total persistence divided by maximum density.
    #[must_use]
    pub(crate) fn normalized_persistence(&self) -> f64 {
        if self.density_maximum > 0.0 {
            self.total_persistence() / self.density_maximum
        } else {
            0.0
        }
    }

    /// Returns the maximum input density.
    #[must_use]
    #[inline]
    pub(crate) const fn density_maximum(&self) -> f64 {
        self.density_maximum
    }

    /// Returns the identity of the maximum density and persistent topology.
    #[must_use]
    pub(crate) fn content_hash(&self) -> ContentHash {
        let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.merge-tree.v2");
        hasher.update(&self.density_maximum.to_bits().to_le_bytes());
        for leaf in &self.leaves {
            hasher.update(&leaf.id.to_le_bytes());
            hasher.update(&leaf.parent.unwrap_or(u64::MAX).to_le_bytes());
            hasher.update(
                &u64::try_from(leaf.representative_pixel)
                    .expect("pixel index should fit u64")
                    .to_le_bytes(),
            );
            hasher.update(&leaf.birth.to_bits().to_le_bytes());
            hasher.update(&leaf.death.to_bits().to_le_bytes());
        }
        hasher.finish()
    }
}

#[derive(Debug)]
struct Components {
    parent: Vec<usize>,
    birth: Vec<f64>,
    representative_pixel: Vec<usize>,
}

impl Components {
    fn with_capacity(elements: usize) -> Result<Self, AnalyticError> {
        Ok(Self {
            parent: empty("merge-tree component parents", elements)?,
            birth: empty("merge-tree component births", elements)?,
            representative_pixel: empty("merge-tree component representative pixels", elements)?,
        })
    }

    fn add(&mut self, birth: f64, representative_pixel: usize) -> usize {
        let component = self.parent.len();
        self.parent.push(component);
        self.birth.push(birth);
        self.representative_pixel.push(representative_pixel);
        component
    }

    fn find(&mut self, child: usize) -> usize {
        let mut root = child;
        while self.parent[root] != root {
            root = self.parent[root];
        }
        let mut child = child;
        while self.parent[child] != root {
            let parent = self.parent[child];
            self.parent[child] = root;
            child = parent;
        }
        root
    }
}

#[derive(Debug, Copy, Clone)]
struct PendingLeaf {
    component: usize,
    parent: Option<usize>,
    birth: f64,
    death: f64,
}

/// Computes persistent components of a density raster.
///
/// Pixels at or above `floor_fraction * max(density)` activate in descending
/// density order, with ascending flat pixel index breaking ties. Eight-neighbor
/// components merge by the elder rule: greater birth density survives, then
/// lower component identity. A dying component is retained when
/// `birth - death >= persistence_fraction * birth`; surviving components are
/// finalized at the floor.
///
/// # Errors
///
/// This returns an error when either fraction leaves `(0, 1]` or any density
/// value is negative or non-finite.
pub(crate) fn merge_tree(
    raster: &DensityRaster,
    config: MergeTreeConfig,
) -> Result<MergeTree, AnalyticError> {
    validate_fraction("floor fraction", config.floor_fraction)?;
    validate_fraction("persistence fraction", config.persistence_fraction)?;
    let values = raster.values();
    let expected = raster.size().checked_mul(raster.size()).ok_or_else(|| {
        AnalyticError::GridAreaOverflow {
            size: raster.size(),
        }
    })?;
    if values.len() != expected {
        return Err(AnalyticError::DensityLength {
            expected,
            actual: values.len(),
        });
    }

    let mut density_maximum = 0.0_f64;
    for (pixel, &value) in values.iter().enumerate() {
        if !value.is_finite() || value.is_sign_negative() {
            return Err(AnalyticError::InvalidDensity { pixel, value });
        }
        density_maximum = density_maximum.max(value);
    }
    if density_maximum <= 0.0 {
        return Ok(MergeTree {
            density_maximum,
            leaves: Vec::new(),
        });
    }

    let floor = config.floor_fraction * density_maximum;
    let mut order = empty("merge-tree activation order", values.len())?;
    order.extend(
        values
            .iter()
            .enumerate()
            .filter_map(|(pixel, &value)| (value >= floor).then_some(pixel)),
    );
    order.sort_unstable_by(|&left, &right| {
        values[right]
            .total_cmp(&values[left])
            .then_with(|| left.cmp(&right))
    });

    let size = raster.size();
    let mut component_of = filled("merge-tree pixel components", values.len(), INACTIVE)?;
    let mut components = Components::with_capacity(order.len())?;
    let mut pending_leaves = empty("merge-tree pending leaves", order.len())?;
    for pixel in order {
        let roots = neighbor_roots(&mut components, &component_of, pixel, size);
        component_of[pixel] = if roots.is_empty() {
            components.add(values[pixel], pixel)
        } else {
            merge_roots(
                &mut components,
                roots.as_slice(),
                values[pixel],
                config.persistence_fraction,
                &mut pending_leaves,
            )
        };
    }
    for component in 0..components.parent.len() {
        if components.parent[component] == component {
            retain_leaf(
                component,
                None,
                components.birth[component],
                floor,
                config.persistence_fraction,
                &mut pending_leaves,
            );
        }
    }
    let leaves = finalize_leaves(&components, &pending_leaves)?;
    Ok(MergeTree {
        density_maximum,
        leaves,
    })
}

fn validate_fraction(field: &'static str, value: f64) -> Result<(), AnalyticError> {
    if !(value.is_finite() && 0.0 < value && value <= 1.0) {
        return Err(AnalyticError::InvalidFraction { field, value });
    }
    Ok(())
}

fn neighbor_roots(
    components: &mut Components,
    component_of: &[usize],
    pixel: usize,
    size: usize,
) -> NeighborRoots {
    let row = pixel / size;
    let column = pixel % size;
    let mut roots = NeighborRoots::new();
    for row_offset in -1..=1 {
        let Some(neighbor_row) = row.checked_add_signed(row_offset) else {
            continue;
        };
        if neighbor_row >= size {
            continue;
        }
        for column_offset in -1..=1 {
            if row_offset == 0 && column_offset == 0 {
                continue;
            }
            let Some(neighbor_column) = column.checked_add_signed(column_offset) else {
                continue;
            };
            if neighbor_column >= size {
                continue;
            }
            let component = component_of[neighbor_row * size + neighbor_column];
            if component != INACTIVE {
                roots.push_unique(components.find(component));
            }
        }
    }
    roots
}

#[expect(
    clippy::float_cmp,
    reason = "equal density bits intentionally use stable component identity as the elder-rule \
              tie-break"
)]
fn merge_roots(
    components: &mut Components,
    roots: &[usize],
    level: f64,
    persistence_fraction: f64,
    leaves: &mut Vec<PendingLeaf>,
) -> usize {
    let mut eldest = roots[0];
    for &root in &roots[1..] {
        if components.birth[root] > components.birth[eldest]
            || (components.birth[root] == components.birth[eldest] && root < eldest)
        {
            eldest = root;
        }
    }
    for &root in roots {
        if root != eldest {
            retain_leaf(
                root,
                Some(eldest),
                components.birth[root],
                level,
                persistence_fraction,
                leaves,
            );
            components.parent[root] = eldest;
        }
    }
    eldest
}

#[inline]
fn retain_leaf(
    component: usize,
    parent: Option<usize>,
    birth: f64,
    death: f64,
    persistence_fraction: f64,
    leaves: &mut Vec<PendingLeaf>,
) {
    if birth - death >= persistence_fraction * birth {
        leaves.push(PendingLeaf {
            component,
            parent,
            birth,
            death,
        });
    }
}

fn finalize_leaves(
    components: &Components,
    pending: &[PendingLeaf],
) -> Result<Vec<PersistenceLeaf>, AnalyticError> {
    let mut leaf_of_component = filled(
        "merge-tree leaf component map",
        components.parent.len(),
        INACTIVE,
    )?;
    for (leaf, pending_leaf) in pending.iter().enumerate() {
        leaf_of_component[pending_leaf.component] = leaf;
    }
    // Persistence filtering may remove an immediate merge parent. Resolve to
    // the nearest retained ancestor so every published parent still names a
    // leaf in this exact artifact rather than an internal sweep component.
    collect_exact(
        "merge-tree finalized leaves",
        pending.iter().enumerate().map(|(leaf, pending_leaf)| {
            let parent =
                retained_parent(pending_leaf.parent, &components.parent, &leaf_of_component)
                    .map(|parent| u64::try_from(parent).expect("leaf index should fit u64"));
            PersistenceLeaf {
                id: u64::try_from(leaf).expect("leaf index should fit u64"),
                parent,
                representative_pixel: components.representative_pixel[pending_leaf.component],
                birth: pending_leaf.birth,
                death: pending_leaf.death,
            }
        }),
    )
}

fn retained_parent(
    mut component: Option<usize>,
    component_parents: &[usize],
    leaf_of_component: &[usize],
) -> Option<usize> {
    while let Some(current) = component {
        let leaf = leaf_of_component[current];
        if leaf != INACTIVE {
            return Some(leaf);
        }
        let parent = component_parents[current];
        component = (parent != current).then_some(parent);
    }
    None
}

struct NeighborRoots {
    values: [usize; 8],
    len: usize,
}

impl NeighborRoots {
    #[inline]
    const fn new() -> Self {
        Self {
            values: [0; 8],
            len: 0,
        }
    }

    #[inline]
    fn push_unique(&mut self, root: usize) {
        if !self.as_slice().contains(&root) {
            self.values[self.len] = root;
            self.len += 1;
        }
    }

    #[inline]
    const fn is_empty(&self) -> bool {
        self.len == 0
    }

    #[inline]
    fn as_slice(&self) -> &[usize] {
        &self.values[..self.len]
    }
}
