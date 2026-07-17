//! Deterministic strata derived from frozen extraction metadata.

#![expect(
    clippy::little_endian_bytes,
    reason = "stratum identities use canonical little-endian scalar encodings"
)]

use std::collections::HashMap;

use super::FitInputError;
use crate::{
    salt::{
        ContentHash, ContentHasher,
        salt_fit_boundary::{EntityRole, GenerationRowId, LandmarkCandidate},
    },
    salt_fit::postgres::PostgresExtraction,
};

const BUCKETS: u32 = 4;
const DENSITY_DECILES: usize = 10;

pub(super) fn landmark_candidates(
    extraction: &PostgresExtraction,
    roles: &[EntityRole],
) -> Result<Vec<LandmarkCandidate>, FitInputError> {
    let rows = extraction.entities.len();
    if roles.len() != rows {
        return Err(FitInputError::Invalid(
            "entity roles do not match the extracted population".to_owned(),
        ));
    }
    let mut row_by_id = HashMap::new();
    row_by_id.try_reserve(rows).map_err(|error| {
        FitInputError::Invalid(format!(
            "stratification identity allocation failed: {error}"
        ))
    })?;
    row_by_id.extend(
        extraction
            .entities
            .iter()
            .enumerate()
            .map(|(row, entity)| (entity.entity_id(), row)),
    );
    let mut degree = try_vec("stratification degrees", rows)?;
    degree.resize(rows, 0_u32);
    let mut components = Components::new(rows)?;
    for link in &extraction.links {
        let left_row = row_by_id.get(&link.left.entity_id).copied();
        let right_row = row_by_id.get(&link.right.entity_id).copied();
        for row in [left_row, right_row].into_iter().flatten() {
            degree[row] = degree[row].saturating_add(1);
        }
        if let (Some(left), Some(right)) = (left_row, right_row) {
            components.union(left, right);
        }
    }
    let density = density_deciles(&degree)?;
    let mut community = try_vec("stratification communities", rows)?;
    for row in 0..rows {
        let root = components.find(row);
        community.push(hash_bucket(
            b"hash.graph.atlas.fit.representation-community.v1",
            &u64::try_from(root)
                .expect("M0 extraction row should fit u64")
                .to_le_bytes(),
        ));
    }
    let mut candidates = try_vec("landmark candidates", rows)?;
    for (row, (entity, &role)) in extraction.entities.iter().zip(roles).enumerate() {
        let web_id: uuid::Uuid = entity.entity_id().web_id.into();
        let edition_id = entity.edition_id().into_uuid();
        let source = hash_bucket(
            b"hash.graph.atlas.fit.representation-source.v1",
            web_id.as_bytes(),
        );
        let temporal_cohort = hash_bucket(
            b"hash.graph.atlas.fit.representation-edition-cohort.v1",
            edition_id.as_bytes(),
        );
        let type_family = entity.entity_types.first().map_or(0, |entity_type| {
            hash_bucket(
                b"hash.graph.atlas.fit.representation-type-family.v1",
                entity_type.base_url.as_str().as_bytes(),
            )
        });
        candidates.push(LandmarkCandidate {
            row: GenerationRowId::try_from(row)
                .map_err(|error| FitInputError::Invalid(error.to_string()))?,
            sampling_weight: 1.0,
            density: density[row],
            language: language_bucket(entity.label.as_deref()),
            source,
            entity_role: role.index(),
            type_family,
            community: community[row],
            temporal_cohort,
            prior_landmark: false,
        });
    }
    Ok(candidates)
}

pub(super) fn quality_subgroups(
    candidates: &[LandmarkCandidate],
) -> Result<Vec<ContentHash>, FitInputError> {
    let mut subgroups = try_vec("quality subgroups", candidates.len())?;
    subgroups.extend(candidates.iter().map(|candidate| {
        let mut hasher =
            ContentHasher::new(b"hash.graph.atlas.fit.quality-role-cohort-subgroup.v2");
        hasher.update(&candidate.entity_role.to_le_bytes());
        hasher.update(&candidate.temporal_cohort.to_le_bytes());
        hasher.finish()
    }));
    Ok(subgroups)
}

fn density_deciles(degrees: &[u32]) -> Result<Vec<u32>, FitInputError> {
    let mut sorted = try_vec("sorted degree distribution", degrees.len())?;
    sorted.extend_from_slice(degrees);
    sorted.sort_unstable();
    let mut density = try_vec("density deciles", degrees.len())?;
    density.extend(degrees.iter().map(|degree| {
        let lower = sorted.partition_point(|candidate| candidate < degree);
        u32::try_from(lower.saturating_mul(DENSITY_DECILES) / sorted.len().max(1))
            .expect("density decile is smaller than ten")
    }));
    Ok(density)
}

fn language_bucket(label: Option<&str>) -> u32 {
    match label {
        None | Some("") => 0,
        Some(label) if label.is_ascii() => 1,
        Some(_) => 2,
    }
}

fn hash_bucket(domain: &'static [u8], value: &[u8]) -> u32 {
    let mut hasher = ContentHasher::new(domain);
    hasher.update(value);
    let hash = hasher.finish();
    u32::from_le_bytes(
        hash.as_bytes()[..4]
            .try_into()
            .expect("SHA-256 contains four bytes"),
    ) % BUCKETS
}

struct Components {
    parent: Vec<usize>,
}

impl Components {
    fn new(rows: usize) -> Result<Self, FitInputError> {
        let mut parent = try_vec("component parents", rows)?;
        parent.extend(0..rows);
        Ok(Self { parent })
    }

    fn find(&mut self, row: usize) -> usize {
        let mut root = row;
        while self.parent[root] != root {
            root = self.parent[root];
        }
        let mut current = row;
        while self.parent[current] != current {
            let next = self.parent[current];
            self.parent[current] = root;
            current = next;
        }
        root
    }

    fn union(&mut self, left: usize, right: usize) {
        let left = self.find(left);
        let right = self.find(right);
        if left != right {
            let (root, child) = if left < right {
                (left, right)
            } else {
                (right, left)
            };
            self.parent[child] = root;
        }
    }
}

fn try_vec<T>(name: &'static str, capacity: usize) -> Result<Vec<T>, FitInputError> {
    let mut values = Vec::new();
    values.try_reserve_exact(capacity).map_err(|error| {
        FitInputError::Invalid(format!(
            "could not reserve {capacity} elements for {name}: {error}"
        ))
    })?;
    Ok(values)
}
