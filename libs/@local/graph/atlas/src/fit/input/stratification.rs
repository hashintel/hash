//! Deterministic strata derived from frozen extraction metadata.

use std::collections::HashMap;

use super::FitInputError;
use crate::{
    fit::postgres::PostgresExtraction,
    salt::{
        ContentHash, ContentHasher,
        fit_boundary::{EntityRole, GenerationRowId, LandmarkCandidate},
    },
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
    let row_by_id = extraction
        .entities
        .iter()
        .enumerate()
        .map(|(row, entity)| (entity.entity_id(), row))
        .collect::<HashMap<_, _>>();
    let mut degree = vec![0_u32; rows];
    let mut components = Components::new(rows);
    for link in &extraction.links {
        let link_row = row_by_id.get(&link.link.entity_id).copied();
        let left_row = row_by_id.get(&link.left.entity_id).copied();
        let right_row = row_by_id.get(&link.right.entity_id).copied();
        for row in [left_row, right_row].into_iter().flatten() {
            degree[row] = degree[row].saturating_add(1);
        }
        if let (Some(left), Some(right)) = (left_row, right_row) {
            components.union(left, right);
        }
        if let Some(link) = link_row {
            degree[link] = degree[link].saturating_add(2);
            if let Some(left) = left_row {
                components.union(link, left);
            }
            if let Some(right) = right_row {
                components.union(link, right);
            }
        }
    }
    let density = density_deciles(&degree);
    let community = (0..rows)
        .map(|row| {
            let root = components.find(row);
            hash_bucket(
                b"hash.graph.atlas.fit.representation-community.v1",
                &u64::try_from(root)
                    .expect("M0 extraction row should fit u64")
                    .to_le_bytes(),
            )
        })
        .collect::<Vec<_>>();
    extraction
        .entities
        .iter()
        .zip(roles)
        .enumerate()
        .map(|(row, (entity, &role))| {
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
            Ok(LandmarkCandidate {
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
            })
        })
        .collect()
}

pub(super) fn quality_subgroups(candidates: &[LandmarkCandidate]) -> Vec<ContentHash> {
    candidates
        .iter()
        .map(|candidate| {
            let mut hasher =
                ContentHasher::new(b"hash.graph.atlas.fit.quality-role-cohort-subgroup.v2");
            hasher.update(&candidate.entity_role.to_le_bytes());
            hasher.update(&candidate.temporal_cohort.to_le_bytes());
            hasher.finish()
        })
        .collect()
}

fn density_deciles(degrees: &[u32]) -> Vec<u32> {
    let mut sorted = degrees.to_vec();
    sorted.sort_unstable();
    degrees
        .iter()
        .map(|degree| {
            let lower = sorted.partition_point(|candidate| candidate < degree);
            u32::try_from(lower.saturating_mul(DENSITY_DECILES) / sorted.len().max(1))
                .expect("density decile is smaller than ten")
        })
        .collect()
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
    fn new(rows: usize) -> Self {
        Self {
            parent: (0..rows).collect(),
        }
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
