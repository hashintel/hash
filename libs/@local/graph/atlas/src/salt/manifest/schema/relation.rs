//! Validation of admitted relation indexes and dense policy sidecars.

use super::{hash, matrix, nonnegative, row_count, unit, variable_vector, vector};
use crate::salt::{
    hash::ContentHasher,
    manifest::GenerationManifest,
    policy::{PlacementPosterior, Probability},
    storage::mmap::{ArtifactView, ScalarType},
};

#[expect(
    clippy::too_many_lines,
    reason = "all relation columns are cross-validated at one artifact trust boundary"
)]
pub(super) fn validate(
    artifact: ArtifactView<'_>,
    manifest: &GenerationManifest,
) -> Result<(), &'static str> {
    let rows = row_count(manifest)?;
    if hash(artifact, 1)? != manifest.relations.policy_hash.as_bytes() {
        return Err("relation policy provenance differs from the manifest");
    }
    let counts = vector(artifact, 2, ScalarType::U64, 2)?
        .as_u64()
        .expect("section scalar type should be validated");
    let &[attraction, protection] = counts else {
        return Err("relation count section has an invalid length");
    };
    let attraction =
        usize::try_from(attraction).map_err(|_error| "attraction count does not fit")?;
    let protection =
        usize::try_from(protection).map_err(|_error| "protection count does not fit")?;
    let policy = validate_policy_sidecar(artifact, manifest)?;
    let policy_count = policy.len();

    let link_web_ids = matrix(artifact, 3, ScalarType::U8, attraction, 16)?
        .as_u8()
        .expect("section scalar type should be validated");
    let link_entity_uuids = matrix(artifact, 4, ScalarType::U8, attraction, 16)?
        .as_u8()
        .expect("section scalar type should be validated");
    let draft_present = vector(artifact, 5, ScalarType::U8, attraction)?
        .as_u8()
        .expect("section scalar type should be validated");
    let draft_ids = matrix(artifact, 6, ScalarType::U8, attraction, 16)?
        .as_u8()
        .expect("section scalar type should be validated");
    let relation_types = vector(artifact, 7, ScalarType::U32, attraction)?
        .as_u32()
        .expect("section scalar type should be validated");
    let left = vector(artifact, 8, ScalarType::U32, attraction)?
        .as_u32()
        .expect("section scalar type should be validated");
    let right = vector(artifact, 9, ScalarType::U32, attraction)?
        .as_u32()
        .expect("section scalar type should be validated");
    let confidence = vector(artifact, 10, ScalarType::F64, attraction)?
        .as_f64()
        .expect("section scalar type should be validated");
    let confidence_provenance = vector(artifact, 11, ScalarType::U8, attraction)?
        .as_u8()
        .expect("section scalar type should be validated");
    let degree = vector(artifact, 12, ScalarType::F64, attraction)?
        .as_f64()
        .expect("section scalar type should be validated");
    let strength = vector(artifact, 13, ScalarType::F64, attraction)?
        .as_f64()
        .expect("section scalar type should be validated");
    let coincident = vector(artifact, 14, ScalarType::F64, attraction)?
        .as_f64()
        .expect("section scalar type should be validated");
    let proximal = vector(artifact, 15, ScalarType::F64, attraction)?
        .as_f64()
        .expect("section scalar type should be validated");

    for index in 0..attraction {
        if relation_types[index] as usize >= policy_count
            || left[index] as usize >= rows
            || right[index] as usize >= rows
            || left[index] == right[index]
        {
            return Err("relation attraction contains an invalid endpoint");
        }
        if draft_present[index] > 1
            || (draft_present[index] == 0 && draft_ids[index * 16..index * 16 + 16] != [0; 16])
        {
            return Err("relation attraction contains an invalid draft identity");
        }
        let policy_index = relation_types[index] as usize;
        let expected_strength = policy.strength[policy_index];
        let expected_coincident = manifest
            .relations
            .attraction_geometry_coefficients
            .coincident
            * policy.effective[policy_index * 3];
        let expected_proximal = manifest.relations.attraction_geometry_coefficients.proximal
            * policy.effective[policy_index * 3 + 1];
        if !unit(confidence[index])
            || confidence_provenance[index] & !0b111 != 0
            || !degree[index].is_finite()
            || degree[index] <= 0.0
            || degree[index] > 0.5
            || !nonnegative(strength[index])
            || !unit(coincident[index])
            || !unit(proximal[index])
            || coincident[index] + proximal[index] > 1.0 + 1.0e-12
            || strength[index].to_bits() != expected_strength.to_bits()
            || coincident[index].to_bits() != expected_coincident.to_bits()
            || proximal[index].to_bits() != expected_proximal.to_bits()
            || confidence[index] * (coincident[index] + proximal[index])
                < manifest.relations.attraction_force_pruning_threshold
        {
            return Err("relation attraction contains an invalid numeric value");
        }
    }

    let first = vector(artifact, 16, ScalarType::U32, protection)?
        .as_u32()
        .expect("section scalar type should be validated");
    let second = vector(artifact, 17, ScalarType::U32, protection)?
        .as_u32()
        .expect("section scalar type should be validated");
    let hard_mass = vector(artifact, 18, ScalarType::F64, protection)?
        .as_f64()
        .expect("section scalar type should be validated");
    let ordinary_mass = vector(artifact, 19, ScalarType::F64, protection)?
        .as_f64()
        .expect("section scalar type should be validated");
    let flags = vector(artifact, 20, ScalarType::U8, protection)?
        .as_u8()
        .expect("section scalar type should be validated");
    let declared_edge_snapshot = hash(artifact, 21)?;
    if declared_edge_snapshot != manifest.relations.edge_snapshot_hash.as_bytes() {
        return Err("relation edge snapshot differs from the manifest");
    }
    let mut previous = None;
    for index in 0..protection {
        let pair = (first[index], second[index]);
        if pair.0 >= pair.1
            || pair.1 as usize >= rows
            || previous.is_some_and(|previous| previous >= pair)
        {
            return Err("relation protection pairs are invalid or unordered");
        }
        let expected_flags = u8::from(
            hard_mass[index]
                >= manifest
                    .relations
                    .negative_admission
                    .hard_negative_protection_threshold,
        ) | (u8::from(
            manifest
                .relations
                .negative_admission
                .protect_ordinary_negatives
                && ordinary_mass[index]
                    >= manifest
                        .relations
                        .negative_admission
                        .ordinary_negative_protection_threshold,
        ) << 1);
        if !unit(hard_mass[index]) || !unit(ordinary_mass[index]) || flags[index] != expected_flags
        {
            return Err("relation protection contains an invalid mass or flag");
        }
        previous = Some(pair);
    }
    let mut edge_snapshot = ContentHasher::new(b"hash.graph.atlas.salt.relation-edge-snapshot.v1");
    for index in 0..attraction {
        edge_snapshot.update(&link_web_ids[index * 16..index * 16 + 16]);
        edge_snapshot.update(&link_entity_uuids[index * 16..index * 16 + 16]);
        edge_snapshot.update(&[draft_present[index]]);
        edge_snapshot.update(&draft_ids[index * 16..index * 16 + 16]);
        edge_snapshot.update(&relation_types[index].to_le_bytes());
        edge_snapshot.update(&left[index].to_le_bytes());
        edge_snapshot.update(&right[index].to_le_bytes());
        edge_snapshot.update(&confidence[index].to_bits().to_le_bytes());
        edge_snapshot.update(&[confidence_provenance[index]]);
        for value in [
            degree[index],
            strength[index],
            coincident[index],
            proximal[index],
        ] {
            edge_snapshot.update(&value.to_bits().to_le_bytes());
        }
    }
    if edge_snapshot.finish().as_bytes() != declared_edge_snapshot {
        return Err("relation edge snapshot hash does not describe the persisted table");
    }
    Ok(())
}

struct PolicySidecar<'artifact> {
    effective: &'artifact [f64],
    strength: &'artifact [f64],
}

impl PolicySidecar<'_> {
    #[inline]
    const fn len(&self) -> usize {
        self.strength.len()
    }
}

#[expect(
    clippy::too_many_lines,
    reason = "policy-sidecar validation keeps every cross-column invariant in one trust boundary"
)]
fn validate_policy_sidecar<'artifact>(
    artifact: ArtifactView<'artifact>,
    manifest: &GenerationManifest,
) -> Result<PolicySidecar<'artifact>, &'static str> {
    let ordinals = variable_vector(artifact, 24, ScalarType::U32)?
        .as_u32()
        .expect("section scalar type should be validated");
    let policies = ordinals.len();
    let offsets = vector(artifact, 22, ScalarType::U64, policies + 1)?
        .as_u64()
        .expect("section scalar type should be validated");
    let bytes = variable_vector(artifact, 23, ScalarType::U8)?
        .as_u8()
        .expect("section scalar type should be validated");
    let sources = vector(artifact, 25, ScalarType::U8, policies)?
        .as_u8()
        .expect("section scalar type should be validated");
    let selected = matrix(artifact, 26, ScalarType::F64, policies, 3)?
        .as_f64()
        .expect("section scalar type should be validated");
    let applicability = vector(artifact, 27, ScalarType::F64, policies)?
        .as_f64()
        .expect("section scalar type should be validated");
    let effective = matrix(artifact, 28, ScalarType::F64, policies, 3)?
        .as_f64()
        .expect("section scalar type should be validated");
    let strength = vector(artifact, 29, ScalarType::F64, policies)?
        .as_f64()
        .expect("section scalar type should be validated");
    let coincident_admitted = vector(artifact, 30, ScalarType::U8, policies)?
        .as_u8()
        .expect("section scalar type should be validated");
    if offsets.first().copied() != Some(0)
        || offsets.last().copied()
            != Some(u64::try_from(bytes.len()).map_err(|_error| "policy bytes do not fit u64")?)
        || !offsets.windows(2).all(|pair| pair.first() < pair.last())
    {
        return Err("relation policy type offsets are invalid");
    }
    let mut policy_hash = ContentHasher::new(b"hash.graph.atlas.salt.resolved-relation-policy.v1");
    for policy in 0..policies {
        let selected_policy = PlacementPosterior::new(
            selected[policy * 3],
            selected[policy * 3 + 1],
            selected[policy * 3 + 2],
        )
        .map_err(|_error| "relation policy selected posterior is invalid")?;
        let applicability_value = Probability::new(applicability[policy])
            .map_err(|_error| "relation policy applicability is invalid")?;
        let attraction = selected_policy.with_applicability(applicability_value);
        let gate = manifest.relations.coincident_gate;
        let expected_admission = gate.enabled
            && attraction.coincident.get() >= gate.class_probability_threshold
            && applicability_value.get() >= gate.applicability_threshold;
        let expected_effective = if expected_admission {
            attraction
        } else {
            attraction.without_coincident()
        };
        let expected_values = [
            expected_effective.coincident.get(),
            expected_effective.proximal.get(),
            expected_effective.overlay.get(),
        ];
        if usize::try_from(ordinals[policy]).ok() != Some(policy)
            || sources[policy] > 4
            || coincident_admitted[policy] > 1
            || !selected[policy * 3..policy * 3 + 3]
                .iter()
                .copied()
                .all(unit)
            || (selected[policy * 3..policy * 3 + 3].iter().sum::<f64>() - 1.0).abs() > 1.0e-9
            || !unit(applicability[policy])
            || !effective[policy * 3..policy * 3 + 3]
                .iter()
                .copied()
                .all(unit)
            || !nonnegative(strength[policy])
            || (sources[policy] <= 2 && applicability_value != Probability::ONE)
            || (sources[policy] == 4
                && (selected_policy != PlacementPosterior::OVERLAY
                    || applicability_value != Probability::ZERO))
            || coincident_admitted[policy] != u8::from(expected_admission)
            || effective[policy * 3..policy * 3 + 3]
                .iter()
                .zip(expected_values)
                .any(|(&actual, expected)| actual.to_bits() != expected.to_bits())
        {
            return Err("relation policy sidecar contains an invalid value");
        }
        let start =
            usize::try_from(offsets[policy]).map_err(|_error| "policy offset does not fit")?;
        let end =
            usize::try_from(offsets[policy + 1]).map_err(|_error| "policy offset does not fit")?;
        let relation_type = core::str::from_utf8(&bytes[start..end])
            .map_err(|_error| "relation policy type is not UTF-8")?;
        let parsed = relation_type
            .parse::<type_system::ontology::VersionedUrl>()
            .map_err(|_error| "relation policy type is not a versioned URL")?;
        if parsed.to_string() != relation_type {
            return Err("relation policy type is not canonically encoded");
        }
        policy_hash.update(&ordinals[policy].to_le_bytes());
        policy_hash.update(relation_type.as_bytes());
        policy_hash.update(&[sources[policy]]);
        for value in [
            selected[policy * 3],
            selected[policy * 3 + 1],
            selected[policy * 3 + 2],
            applicability[policy],
            effective[policy * 3],
            effective[policy * 3 + 1],
            effective[policy * 3 + 2],
            strength[policy],
        ] {
            policy_hash.update(&value.to_bits().to_le_bytes());
        }
        policy_hash.update(&[coincident_admitted[policy]]);
    }
    if policy_hash.finish() != manifest.relations.policy_hash {
        return Err("relation policy sidecar hash differs from the manifest");
    }
    Ok(PolicySidecar {
        effective,
        strength,
    })
}
