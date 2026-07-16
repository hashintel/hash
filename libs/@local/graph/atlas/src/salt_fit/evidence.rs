//! Local release signing and out-of-process gate issuance.

#![expect(
    clippy::std_instead_of_core,
    reason = "core::io::ErrorKind remains unstable on the pinned toolchain"
)]

use core::{fmt, time::Duration};
use std::{
    io::{ErrorKind, Read as _, Write as _},
    process::{Command, Stdio},
    time::Instant,
};

use camino::{Utf8Path, Utf8PathBuf};
use serde::Serialize;

use super::{
    FitAssuranceMode,
    configuration::{
        LoadedExternalAuthority, LoadedFitAuthorities, LoadedFitAuthority,
        deferred_authority_secret,
    },
};
use crate::salt::{
    ContentHash,
    salt_fit_boundary::{
        ArtifactRole, ExternalGateGrant, ExternalGateGrantIssuer, ExternalGateReport,
        GateEvidenceError, GateId, GateSigner, GateVerifier, GenerationManifest, ReleaseHead,
    },
};

const EXTERNAL_ISSUER_PROTOCOL_VERSION: u32 = 1;
const MAXIMUM_ISSUER_OUTPUT_BYTES: u64 = 4 * 1_024 * 1_024;
const EXTERNAL_ISSUER_TIMEOUT: Duration = Duration::from_mins(5);

/// One pinned external process and its out-of-band verifier.
pub(in crate::salt_fit) struct FitExternalAuthority {
    pub issuer: FitGateGrantIssuer,
    pub verifier: GateVerifier,
}

/// Local release authority paired with eight independently executed gate authorities.
pub(in crate::salt_fit) struct FitRuntimeAuthorities {
    pub release: GateSigner,
    pub representation: FitExternalAuthority,
    pub semantic_fidelity: FitExternalAuthority,
    pub relation_policy: FitExternalAuthority,
    pub merge_tree_persistence: FitExternalAuthority,
    pub subgroup_behavior: FitExternalAuthority,
    pub authorization_noninterference: FitExternalAuthority,
    pub security_approval: FitExternalAuthority,
    pub companion_pin: FitExternalAuthority,
}

impl FitRuntimeAuthorities {
    pub(in crate::salt_fit) fn new(
        authorities: &LoadedFitAuthorities,
        atlas_root: &Utf8Path,
        assurance: FitAssuranceMode,
    ) -> Result<Self, GateEvidenceError> {
        let authority = |loaded: &LoadedExternalAuthority,
                         field: &'static str|
         -> Result<FitExternalAuthority, GateEvidenceError> {
            match assurance {
                FitAssuranceMode::M0LocalAttestation => external(loaded, atlas_root),
                FitAssuranceMode::EvidenceDeferredLocal => {
                    deferred(&authorities.release, loaded, field)
                }
            }
        };
        Ok(Self {
            release: signer(&authorities.release)?,
            representation: authority(&authorities.representation, "representation")?,
            semantic_fidelity: authority(&authorities.semantic_fidelity, "semanticFidelity")?,
            relation_policy: authority(&authorities.relation_policy, "relationPolicy")?,
            merge_tree_persistence: authority(
                &authorities.merge_tree_persistence,
                "mergeTreePersistence",
            )?,
            subgroup_behavior: authority(&authorities.subgroup_behavior, "subgroupBehavior")?,
            authorization_noninterference: authority(
                &authorities.authorization_noninterference,
                "authorizationNoninterference",
            )?,
            security_approval: authority(&authorities.security_approval, "securityApproval")?,
            companion_pin: authority(&authorities.companion_pin, "companionPin")?,
        })
    }

    pub(in crate::salt_fit) const fn external(&self) -> [&FitExternalAuthority; 8] {
        [
            &self.representation,
            &self.semantic_fidelity,
            &self.relation_policy,
            &self.merge_tree_persistence,
            &self.subgroup_behavior,
            &self.authorization_noninterference,
            &self.security_approval,
            &self.companion_pin,
        ]
    }
}

pub(in crate::salt_fit) const EXTERNAL_GATES: [GateId; 8] = [
    GateId::Representation,
    GateId::SemanticFidelity,
    GateId::RelationPolicy,
    GateId::MergeTreePersistence,
    GateId::SubgroupBehavior,
    GateId::AuthorizationNoninterference,
    GateId::SecurityApproval,
    GateId::CompanionPin,
];

/// Separate-process implementation of the exact-head external grant protocol.
pub(in crate::salt_fit) struct CommandExternalGateGrantIssuer {
    command: Utf8PathBuf,
    atlas_root: Utf8PathBuf,
}

/// Strict command issuer or explicitly provisional local issuer.
#[derive(Debug)]
pub(in crate::salt_fit) enum FitGateGrantIssuer {
    Command(CommandExternalGateGrantIssuer),
    Deferred(DeferredExternalGateGrantIssuer),
}

impl ExternalGateGrantIssuer for FitGateGrantIssuer {
    fn issue(
        &self,
        head: ReleaseHead,
        manifest: &GenerationManifest,
        gate: GateId,
    ) -> Result<ExternalGateGrant, GateEvidenceError> {
        match self {
            Self::Command(issuer) => issuer.issue(head, manifest, gate),
            Self::Deferred(issuer) => issuer.issue(head, manifest, gate),
        }
    }
}

/// Locally derived provisional signer used only by evidence-deferred fits.
#[derive(Debug)]
pub(in crate::salt_fit) struct DeferredExternalGateGrantIssuer {
    signer: GateSigner,
}

impl ExternalGateGrantIssuer for DeferredExternalGateGrantIssuer {
    fn issue(
        &self,
        head: ReleaseHead,
        manifest: &GenerationManifest,
        gate: GateId,
    ) -> Result<ExternalGateGrant, GateEvidenceError> {
        let expected = expected_external_report(manifest, gate)?;
        ExternalGateGrant::sign(
            head,
            gate,
            expected.suite_version(),
            expected.content_hash(),
            &self.signer,
        )
    }
}

impl fmt::Debug for CommandExternalGateGrantIssuer {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("CommandExternalGateGrantIssuer")
            .field("command", &self.command)
            .field("atlas_root", &self.atlas_root)
            .finish()
    }
}

impl ExternalGateGrantIssuer for CommandExternalGateGrantIssuer {
    fn issue(
        &self,
        head: ReleaseHead,
        manifest: &GenerationManifest,
        gate: GateId,
    ) -> Result<ExternalGateGrant, GateEvidenceError> {
        let expected = expected_external_report(manifest, gate)?;
        let request = ExternalIssuerRequest {
            version: EXTERNAL_ISSUER_PROTOCOL_VERSION,
            atlas_root: &self.atlas_root,
            head,
            gate,
            suite_version: expected.suite_version(),
            report: expected.content_hash(),
        };
        let request = serde_json::to_vec(&request)?;
        let mut child = Command::new(&self.command)
            .current_dir(&self.atlas_root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        child
            .stdin
            .take()
            .ok_or(GateEvidenceError::Failed {
                gate,
                reason: "external issuer stdin is unavailable",
            })?
            .write_all(&request)?;
        let stdout = child.stdout.take().ok_or(GateEvidenceError::Failed {
            gate,
            reason: "external issuer stdout is unavailable",
        })?;
        let stderr = child.stderr.take().ok_or(GateEvidenceError::Failed {
            gate,
            reason: "external issuer stderr is unavailable",
        })?;
        let (status, stdout, stderr) = std::thread::scope(|scope| {
            let stdout = scope.spawn(|| read_bounded(stdout));
            let stderr = scope.spawn(|| read_bounded(stderr));
            (
                wait_for_child(&mut child),
                stdout.join().map_err(|_panic| ()),
                stderr.join().map_err(|_panic| ()),
            )
        });
        let status = status?;
        let stdout = stdout.map_err(|()| GateEvidenceError::Failed {
            gate,
            reason: "external issuer output reader panicked",
        })??;
        let _stderr_output = stderr.map_err(|()| GateEvidenceError::Failed {
            gate,
            reason: "external issuer error reader panicked",
        })??;
        if !status.success() {
            return Err(GateEvidenceError::Failed {
                gate,
                reason: "external issuer process rejected the gate",
            });
        }
        let grant: ExternalGateGrant = serde_json::from_slice(&stdout)?;
        if (grant.suite_version(), grant.report())
            != (expected.suite_version(), expected.content_hash())
        {
            return Err(GateEvidenceError::Failed {
                gate,
                reason: "external issuer approved a different report",
            });
        }
        Ok(grant)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalIssuerRequest<'request> {
    version: u32,
    atlas_root: &'request Utf8Path,
    head: ReleaseHead,
    gate: GateId,
    suite_version: &'request str,
    report: crate::salt::ContentHash,
}

fn expected_external_report(
    manifest: &GenerationManifest,
    gate: GateId,
) -> Result<ExternalGateReport, GateEvidenceError> {
    let canonical = || {
        manifest
            .variants
            .entries
            .iter()
            .find(|entry| entry.id == manifest.variants.canonical_variant)
            .ok_or(GateEvidenceError::Failed {
                gate,
                reason: "canonical variant evidence is absent",
            })
    };
    let (suite, role) = match gate {
        GateId::Representation => (
            manifest
                .embedding
                .representation_audit
                .suite_version
                .as_str(),
            ArtifactRole::RepresentationReport,
        ),
        GateId::SemanticFidelity => {
            let entry = canonical()?;
            (
                entry.quality_suite_version.as_str(),
                ArtifactRole::SemanticFidelityReport,
            )
        }
        GateId::RelationPolicy => (
            manifest.relations.policy_precedence_version.as_str(),
            ArtifactRole::RelationPolicyReport,
        ),
        GateId::MergeTreePersistence => {
            let entry = canonical()?;
            (
                entry.persistence_comparison.suite_version.as_str(),
                ArtifactRole::MergeTreePersistenceReport,
            )
        }
        GateId::SubgroupBehavior => {
            let entry = canonical()?;
            (
                entry.quality_suite_version.as_str(),
                ArtifactRole::SubgroupBehaviorReport,
            )
        }
        GateId::AuthorizationNoninterference => (
            manifest.serving.authorization_adapter_version.as_str(),
            ArtifactRole::AuthorizationNoninterferenceReport,
        ),
        GateId::SecurityApproval => (
            manifest.serving.authorization_adapter_version.as_str(),
            ArtifactRole::SecurityApprovalReport,
        ),
        GateId::CompanionPin => (
            manifest.serving.canvas_companion_version.as_str(),
            ArtifactRole::CompanionPinReport,
        ),
        gate @ (GateId::AnnRecall
        | GateId::RelationSatisfaction
        | GateId::TemporalDrift
        | GateId::SnapshotConsistency
        | GateId::Reproducibility) => return Err(GateEvidenceError::Unexpected { gate }),
    };
    let report = manifest
        .artifacts
        .iter()
        .find(|artifact| artifact.role == role)
        .ok_or(GateEvidenceError::Failed {
            gate,
            reason: "persisted external gate report artifact is absent",
        })?
        .content_hash;
    ExternalGateReport::new(gate, suite, report)
}

fn signer(authority: &LoadedFitAuthority) -> Result<GateSigner, GateEvidenceError> {
    GateSigner::new(authority.authority.clone(), authority.secret)
}

fn external(
    authority: &LoadedExternalAuthority,
    atlas_root: &Utf8Path,
) -> Result<FitExternalAuthority, GateEvidenceError> {
    Ok(FitExternalAuthority {
        issuer: FitGateGrantIssuer::Command(CommandExternalGateGrantIssuer {
            command: authority.issuer_command.clone(),
            atlas_root: atlas_root.to_owned(),
        }),
        verifier: GateVerifier::new(authority.authority.clone(), authority.public_key)?,
    })
}

fn deferred(
    release: &LoadedFitAuthority,
    authority: &LoadedExternalAuthority,
    field: &'static str,
) -> Result<FitExternalAuthority, GateEvidenceError> {
    let signer = GateSigner::new(
        authority.authority.clone(),
        deferred_authority_secret(release, field),
    )?;
    if signer.verifier().public_key() != ContentHash::from_bytes(authority.public_key) {
        return Err(GateEvidenceError::Failed {
            gate: gate_for_field(field),
            reason: "derived deferred authority differs from its loaded verifier",
        });
    }
    Ok(FitExternalAuthority {
        verifier: signer.verifier(),
        issuer: FitGateGrantIssuer::Deferred(DeferredExternalGateGrantIssuer { signer }),
    })
}

fn gate_for_field(field: &'static str) -> GateId {
    match field {
        "representation" => GateId::Representation,
        "semanticFidelity" => GateId::SemanticFidelity,
        "relationPolicy" => GateId::RelationPolicy,
        "mergeTreePersistence" => GateId::MergeTreePersistence,
        "subgroupBehavior" => GateId::SubgroupBehavior,
        "authorizationNoninterference" => GateId::AuthorizationNoninterference,
        "securityApproval" => GateId::SecurityApproval,
        "companionPin" => GateId::CompanionPin,
        _ => unreachable!("deferred authority field is statically enumerated"),
    }
}

fn read_bounded(reader: impl std::io::Read) -> Result<Vec<u8>, std::io::Error> {
    let mut bytes = Vec::new();
    reader
        .take(MAXIMUM_ISSUER_OUTPUT_BYTES.saturating_add(1))
        .read_to_end(&mut bytes)?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAXIMUM_ISSUER_OUTPUT_BYTES {
        return Err(std::io::Error::new(
            ErrorKind::InvalidData,
            "external issuer output exceeds the process ceiling",
        ));
    }
    Ok(bytes)
}

fn wait_for_child(
    child: &mut std::process::Child,
) -> Result<std::process::ExitStatus, std::io::Error> {
    let deadline = Instant::now() + EXTERNAL_ISSUER_TIMEOUT;
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(status);
        }
        if Instant::now() >= deadline {
            child.kill()?;
            let _status = child.wait()?;
            return Err(std::io::Error::new(
                ErrorKind::TimedOut,
                "external gate issuer exceeded its five-minute deadline",
            ));
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::salt::{
        ContentHash,
        salt_fit_boundary::{TrustedExternalGateAuthority, fixture_manifest},
    };

    #[test]
    fn expected_report_suites_are_taken_from_the_frozen_manifest() {
        let mut manifest = fixture_manifest();
        manifest.relations.policy_precedence_version = "policy-suite-v7".to_owned();
        manifest.serving.authorization_adapter_version = "authorization-suite-v4".to_owned();
        manifest.serving.canvas_companion_version = "companion-suite-v3".to_owned();
        manifest.relations.policy_evaluation_report_hash = ContentHash::digest(b"policy-report");
        manifest.relations.authorization_noninterference_report_hash =
            ContentHash::digest(b"authorization-report");
        manifest.relations.security_approval_report_hash = ContentHash::digest(b"security-report");
        manifest.serving.companion_compatibility_report_hash =
            ContentHash::digest(b"companion-report");
        for (gate, expected) in [
            (GateId::RelationPolicy, "policy-suite-v7"),
            (
                GateId::AuthorizationNoninterference,
                "authorization-suite-v4",
            ),
            (GateId::SecurityApproval, "authorization-suite-v4"),
            (GateId::CompanionPin, "companion-suite-v3"),
        ] {
            let report = expected_external_report(&manifest, gate)
                .expect("manifest-bound report should build");
            assert_eq!(report.suite_version(), expected);
        }
    }

    #[cfg(unix)]
    #[test]
    fn command_issuer_returns_an_independently_verified_exact_head_grant() {
        use std::{fs, os::unix::fs::PermissionsExt as _};

        let temporary = tempfile::tempdir().expect("temporary directory should be created");
        let root = Utf8PathBuf::from_path_buf(temporary.path().to_owned())
            .expect("temporary path should be UTF-8");
        let manifest = fixture_manifest();
        let head = ReleaseHead::for_test();
        let gate = GateId::RelationPolicy;
        let expected =
            expected_external_report(&manifest, gate).expect("expected report should build");
        let signer = GateSigner::new("independent-relation-policy", [0xA5; 32])
            .expect("test signer should validate");
        let grant = ExternalGateGrant::sign(
            head,
            gate,
            expected.suite_version(),
            expected.content_hash(),
            &signer,
        )
        .expect("test grant should sign");
        let grant = serde_json::to_string(&grant).expect("test grant should serialize");
        let script = root.join("issuer");
        fs::write(
            &script,
            format!("#!/bin/sh\n/bin/cat >/dev/null\n/usr/bin/printf '%s\\n' '{grant}'\n"),
        )
        .expect("issuer fixture should be written");
        fs::set_permissions(&script, fs::Permissions::from_mode(0o700))
            .expect("issuer fixture should be executable");
        let issuer = CommandExternalGateGrantIssuer {
            command: script,
            atlas_root: root,
        };
        let authority = TrustedExternalGateAuthority::new(gate, &issuer, signer.verifier())
            .expect("external authority should construct");

        authority
            .issue(head, &manifest)
            .expect("separate process grant should verify");
    }
}
