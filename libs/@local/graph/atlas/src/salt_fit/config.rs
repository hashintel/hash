use core::fmt;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt as _;
use std::{collections::HashSet, fs, io::Read as _};

use camino::{Utf8Component, Utf8Path, Utf8PathBuf};
use ed25519_dalek::SigningKey;
use sha2::{Digest as _, Sha256};

#[path = "config/manifest.rs"]
mod manifest;

use self::manifest::validate_manifest_contract;
use super::{
    FIT_SCHEMA_VERSION, FitAssuranceMode, FitAuthoritiesV1, FitConfigurationError,
    FitExternalAuthorityV1, FitInputBundleV1, FitInputReferenceV1, FitRequestV1,
    FitSigningAuthorityV1, FitWorkerConfigurationV1, MAXIMUM_FIT_CPU_THREADS, MAXIMUM_FIT_ENTITIES,
    MAXIMUM_FIT_LABEL_BYTES, MAXIMUM_FIT_LINKS, MAXIMUM_FIT_RELATION_TYPES,
    MAXIMUM_FIT_REQUIRED_TYPES_PER_LINK, MAXIMUM_FIT_WEB_IDS, MINIMUM_FIT_ENTITIES,
};

const MAXIMUM_DOCUMENT_BYTES: u64 = 16 * 1_024 * 1_024;
const MAXIMUM_INPUT_ASSET_BYTES: u64 = 512 * 1_024 * 1_024;
const MAXIMUM_SECRET_BYTES: u64 = 4 * 1_024;

pub(crate) struct LoadedFitWorkerConfiguration {
    pub document: FitWorkerConfigurationV1,
    pub atlas_root: Utf8PathBuf,
    pub input_root: Utf8PathBuf,
    pub serving_config_output: Utf8PathBuf,
    pub postgres_password: String,
    pub authorities: LoadedFitAuthorities,
}

impl fmt::Debug for LoadedFitWorkerConfiguration {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LoadedFitWorkerConfiguration")
            .field("document", &self.document)
            .field("atlas_root", &self.atlas_root)
            .field("input_root", &self.input_root)
            .field("serving_config_output", &self.serving_config_output)
            .field("postgres_password", &"[REDACTED]")
            .field("authorities", &self.authorities)
            .finish()
    }
}

pub(crate) struct LoadedFitAuthorities {
    pub release: LoadedFitAuthority,
    pub representation: LoadedExternalAuthority,
    pub semantic_fidelity: LoadedExternalAuthority,
    pub relation_policy: LoadedExternalAuthority,
    pub merge_tree_persistence: LoadedExternalAuthority,
    pub subgroup_behavior: LoadedExternalAuthority,
    pub authorization_noninterference: LoadedExternalAuthority,
    pub security_approval: LoadedExternalAuthority,
    pub companion_pin: LoadedExternalAuthority,
}

impl fmt::Debug for LoadedFitAuthorities {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LoadedFitAuthorities")
            .field("release", &self.release)
            .field("representation", &self.representation)
            .field("semantic_fidelity", &self.semantic_fidelity)
            .field("relation_policy", &self.relation_policy)
            .field("merge_tree_persistence", &self.merge_tree_persistence)
            .field("subgroup_behavior", &self.subgroup_behavior)
            .field(
                "authorization_noninterference",
                &self.authorization_noninterference,
            )
            .field("security_approval", &self.security_approval)
            .field("companion_pin", &self.companion_pin)
            .finish()
    }
}

pub(crate) struct LoadedFitAuthority {
    pub authority: String,
    pub secret: [u8; 32],
    pub public_key: [u8; 32],
}

pub(crate) struct LoadedExternalAuthority {
    pub authority: String,
    pub issuer_command: Utf8PathBuf,
    pub public_key: [u8; 32],
}

impl fmt::Debug for LoadedExternalAuthority {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LoadedExternalAuthority")
            .field("authority", &self.authority)
            .field("issuer_command", &self.issuer_command)
            .field("public_key", &encode_hex(&self.public_key))
            .finish()
    }
}

impl fmt::Debug for LoadedFitAuthority {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LoadedFitAuthority")
            .field("authority", &self.authority)
            .field("public_key", &encode_hex(&self.public_key))
            .finish_non_exhaustive()
    }
}

pub(crate) fn load_worker_configuration(
    source: &Utf8Path,
    bytes: &[u8],
) -> Result<LoadedFitWorkerConfiguration, FitConfigurationError> {
    load_worker_configuration_for_assurance(source, bytes, FitAssuranceMode::M0LocalAttestation)
}

pub(crate) fn load_worker_configuration_for_assurance(
    source: &Utf8Path,
    bytes: &[u8],
    assurance: FitAssuranceMode,
) -> Result<LoadedFitWorkerConfiguration, FitConfigurationError> {
    let document: FitWorkerConfigurationV1 =
        serde_json::from_slice(bytes).map_err(|source| FitConfigurationError::Json {
            document: "fit worker configuration",
            source,
        })?;
    validate_worker(&document)?;
    let directory = source
        .parent()
        .filter(|parent| !parent.as_str().is_empty())
        .unwrap_or_else(|| Utf8Path::new("."));
    let directory = canonicalize_utf8(directory)?;
    let atlas_root = resolve_relative(&directory, &document.atlas_root, "atlasRoot")?;
    let input_root = resolve_relative(&directory, &document.input_root, "inputRoot")?;
    let serving_config_output = resolve_relative(
        &directory,
        &document.serving_config_output,
        "servingConfigOutput",
    )?;
    let password_path = canonical_existing_beneath(
        &directory,
        &document.postgres.password_file,
        "postgres.passwordFile",
    )?;
    let postgres_password = read_secret_text(&password_path)?;
    let authorities = load_authorities(&directory, &document.authorities, assurance)?;

    Ok(LoadedFitWorkerConfiguration {
        document,
        atlas_root,
        input_root,
        serving_config_output,
        postgres_password,
        authorities,
    })
}

pub(crate) fn load_request(bytes: &[u8]) -> Result<FitRequestV1, FitConfigurationError> {
    let request: FitRequestV1 =
        serde_json::from_slice(bytes).map_err(|source| FitConfigurationError::Json {
            document: "fit request",
            source,
        })?;
    if request.schema_version != FIT_SCHEMA_VERSION {
        return Err(FitConfigurationError::Invalid {
            field: "schemaVersion",
            reason: "only schema version 1 is supported",
        });
    }
    if request.request_id.is_nil() {
        return Err(FitConfigurationError::Invalid {
            field: "requestId",
            reason: "the request UUID must not be nil",
        });
    }
    if request.web_ids.is_empty() {
        return Err(FitConfigurationError::Invalid {
            field: "webIds",
            reason: "M0 requires at least one explicit web scope",
        });
    }
    if request.web_ids.len() > MAXIMUM_FIT_WEB_IDS {
        return Err(FitConfigurationError::Invalid {
            field: "webIds",
            reason: "the explicit web scope exceeds the M0 process ceiling",
        });
    }
    let mut web_ids = HashSet::with_capacity(request.web_ids.len());
    for web_id in &request.web_ids {
        if web_id.is_nil() {
            return Err(FitConfigurationError::Invalid {
                field: "webIds",
                reason: "web UUIDs must not be nil",
            });
        }
        if !web_ids.insert(*web_id) {
            return Err(FitConfigurationError::Invalid {
                field: "webIds",
                reason: "web UUIDs must be pairwise distinct",
            });
        }
    }
    if request.sample.target_entities < MINIMUM_FIT_ENTITIES
        || request.sample.target_entities > request.limits.maximum_entities
        || request.sample.target_entities > MAXIMUM_FIT_ENTITIES
    {
        return Err(FitConfigurationError::Invalid {
            field: "sample.targetEntities",
            reason: "must be at least 51 and no greater than either entity ceiling",
        });
    }
    for (field, value, maximum) in [
        (
            "limits.maximumEntities",
            request.limits.maximum_entities,
            MAXIMUM_FIT_ENTITIES,
        ),
        (
            "limits.maximumLinks",
            request.limits.maximum_links,
            MAXIMUM_FIT_LINKS,
        ),
        (
            "limits.maximumRelationTypes",
            request.limits.maximum_relation_types,
            MAXIMUM_FIT_RELATION_TYPES,
        ),
        (
            "limits.maximumRequiredTypesPerLink",
            request.limits.maximum_required_types_per_link,
            MAXIMUM_FIT_REQUIRED_TYPES_PER_LINK,
        ),
        (
            "limits.maximumLabelBytes",
            request.limits.maximum_label_bytes,
            MAXIMUM_FIT_LABEL_BYTES,
        ),
    ] {
        if value == 0 || value > maximum {
            return Err(FitConfigurationError::Invalid {
                field,
                reason: "must be positive and no greater than the M0 process ceiling",
            });
        }
    }
    validate_sha256("inputBundle.sha256", &request.input_bundle.sha256)?;
    Ok(request)
}

pub(crate) fn load_input_bundle(
    input_root: &Utf8Path,
    reference: &FitInputReferenceV1,
) -> Result<FitInputBundleV1, FitConfigurationError> {
    let (_path, bytes) = read_content_addressed_with_path(
        input_root,
        "inputBundle",
        reference,
        MAXIMUM_DOCUMENT_BYTES,
    )?;
    let bundle: FitInputBundleV1 =
        serde_json::from_slice(&bytes).map_err(|source| FitConfigurationError::Json {
            document: "fit input bundle",
            source,
        })?;
    if bundle.schema_version != FIT_SCHEMA_VERSION {
        return Err(FitConfigurationError::Invalid {
            field: "inputBundle.schemaVersion",
            reason: "only schema version 1 is supported",
        });
    }
    validate_manifest_contract(&bundle.manifest)?;
    for (field, reference) in bundle_references(&bundle) {
        validate_sha256(field, &reference.sha256)?;
    }
    Ok(bundle)
}

pub(crate) fn read_content_addressed(
    root: &Utf8Path,
    field: &'static str,
    reference: &FitInputReferenceV1,
) -> Result<Vec<u8>, FitConfigurationError> {
    read_content_addressed_with_path(root, field, reference, MAXIMUM_INPUT_ASSET_BYTES)
        .map(|(_path, bytes)| bytes)
}

pub(crate) fn read_content_addressed_document(
    root: &Utf8Path,
    field: &'static str,
    reference: &FitInputReferenceV1,
) -> Result<Vec<u8>, FitConfigurationError> {
    read_content_addressed_with_path(root, field, reference, MAXIMUM_DOCUMENT_BYTES)
        .map(|(_path, bytes)| bytes)
}

pub(crate) fn content_addressed_path(
    root: &Utf8Path,
    field: &'static str,
    reference: &FitInputReferenceV1,
) -> Result<Utf8PathBuf, FitConfigurationError> {
    let path = canonical_existing_beneath(root, &reference.path, field)?;
    verify_content_addressed_file(&path, field, reference, MAXIMUM_INPUT_ASSET_BYTES)?;
    Ok(path)
}

fn read_content_addressed_with_path(
    root: &Utf8Path,
    field: &'static str,
    reference: &FitInputReferenceV1,
    maximum: u64,
) -> Result<(Utf8PathBuf, Vec<u8>), FitConfigurationError> {
    let path = canonical_existing_beneath(root, &reference.path, field)?;
    let bytes = read_bounded(&path, maximum)?;
    let actual = encode_hex(&Sha256::digest(&bytes));
    if actual != reference.sha256 {
        return Err(FitConfigurationError::ContentHash { field, path });
    }
    Ok((path, bytes))
}

fn verify_content_addressed_file(
    path: &Utf8Path,
    field: &'static str,
    reference: &FitInputReferenceV1,
    maximum: u64,
) -> Result<(), FitConfigurationError> {
    let file = open_file(path)?;
    let metadata = file
        .metadata()
        .map_err(|source| FitConfigurationError::Io {
            path: path.to_owned(),
            source,
        })?;
    if !metadata.is_file() || metadata.len() > maximum {
        return Err(FitConfigurationError::Invalid {
            field: "file",
            reason: "input is not a bounded regular file",
        });
    }
    let mut hasher = Sha256::new();
    let mut bytes_read = 0_u64;
    let mut buffer = [0_u8; 16 * 1_024];
    let mut bounded = file.take(maximum.saturating_add(1));
    loop {
        let read = bounded
            .read(&mut buffer)
            .map_err(|source| FitConfigurationError::Io {
                path: path.to_owned(),
                source,
            })?;
        if read == 0 {
            break;
        }
        bytes_read = bytes_read.saturating_add(u64::try_from(read).expect("buffer read fits u64"));
        if bytes_read > maximum {
            return Err(FitConfigurationError::Invalid {
                field: "file",
                reason: "input is not a bounded regular file",
            });
        }
        hasher.update(&buffer[..read]);
    }
    if encode_hex(&hasher.finalize()) != reference.sha256 {
        return Err(FitConfigurationError::ContentHash {
            field,
            path: path.to_owned(),
        });
    }
    Ok(())
}

fn validate_worker(document: &FitWorkerConfigurationV1) -> Result<(), FitConfigurationError> {
    if document.schema_version != FIT_SCHEMA_VERSION {
        return Err(FitConfigurationError::Invalid {
            field: "schemaVersion",
            reason: "only schema version 1 is supported",
        });
    }
    if document.actor_id.is_nil() {
        return Err(FitConfigurationError::Invalid {
            field: "actorId",
            reason: "the actor UUID must not be nil",
        });
    }
    if !matches!(
        document.postgres.host.as_str(),
        "127.0.0.1" | "::1" | "localhost"
    ) {
        return Err(FitConfigurationError::Invalid {
            field: "postgres.host",
            reason: "M0 permits no-TLS PostgreSQL only on loopback",
        });
    }
    if document.postgres.port == 0 {
        return Err(FitConfigurationError::Invalid {
            field: "postgres.port",
            reason: "must be a non-zero TCP port",
        });
    }
    if document.cpu_threads.get() > MAXIMUM_FIT_CPU_THREADS {
        return Err(FitConfigurationError::Invalid {
            field: "cpuThreads",
            reason: "the requested Rayon pool exceeds the M0 process ceiling",
        });
    }
    Ok(())
}

fn load_authorities(
    directory: &Utf8Path,
    document: &FitAuthoritiesV1,
    assurance: FitAssuranceMode,
) -> Result<LoadedFitAuthorities, FitConfigurationError> {
    let mut names = HashSet::new();
    let mut keys = HashSet::new();
    let release = load_authority(directory, "release", &document.release)?;
    names.insert(release.authority.clone());
    keys.insert(release.public_key);
    let mut external = Vec::with_capacity(8);
    for (field, authority) in document.external_entries() {
        let value = match assurance {
            FitAssuranceMode::M0LocalAttestation => {
                load_external_authority(directory, field, authority)?
            }
            FitAssuranceMode::EvidenceDeferredLocal => deferred_external_authority(&release, field),
        };
        require_distinct_authority(&mut names, &mut keys, &value.authority, value.public_key)?;
        external.push(value);
    }
    let mut external = external.into_iter();
    Ok(LoadedFitAuthorities {
        release,
        representation: external.next().expect("eight authorities should be loaded"),
        semantic_fidelity: external.next().expect("eight authorities should be loaded"),
        relation_policy: external.next().expect("eight authorities should be loaded"),
        merge_tree_persistence: external.next().expect("eight authorities should be loaded"),
        subgroup_behavior: external.next().expect("eight authorities should be loaded"),
        authorization_noninterference: external.next().expect("eight authorities should be loaded"),
        security_approval: external.next().expect("eight authorities should be loaded"),
        companion_pin: external.next().expect("eight authorities should be loaded"),
    })
}

fn deferred_external_authority(
    release: &LoadedFitAuthority,
    field: &'static str,
) -> LoadedExternalAuthority {
    let secret = deferred_authority_secret(release, field);
    let public_key = SigningKey::from_bytes(&secret).verifying_key().to_bytes();
    LoadedExternalAuthority {
        authority: format!("evidence-deferred-local-{field}-v1"),
        issuer_command: Utf8PathBuf::new(),
        public_key,
    }
}

pub(crate) fn deferred_authority_secret(
    release: &LoadedFitAuthority,
    field: &'static str,
) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"hash.graph.atlas.fit.evidence-deferred-authority.v1");
    hasher.update(release.secret);
    hasher.update(field.as_bytes());
    hasher.finalize().into()
}

fn require_distinct_authority(
    names: &mut HashSet<String>,
    keys: &mut HashSet<[u8; 32]>,
    authority: &str,
    public_key: [u8; 32],
) -> Result<(), FitConfigurationError> {
    if !names.insert(authority.to_owned()) {
        return Err(FitConfigurationError::Invalid {
            field: "authorities",
            reason: "authority names must be pairwise distinct",
        });
    }
    if !keys.insert(public_key) {
        return Err(FitConfigurationError::Invalid {
            field: "authorities",
            reason: "authority keys must be pairwise distinct",
        });
    }
    Ok(())
}

fn load_authority(
    directory: &Utf8Path,
    field: &'static str,
    document: &FitSigningAuthorityV1,
) -> Result<LoadedFitAuthority, FitConfigurationError> {
    validate_authority_name(field, &document.authority)?;
    let secret_path = canonical_existing_beneath(directory, &document.secret_key_file, field)?;
    let secret_text = read_secret_text(&secret_path)?;
    let secret = decode_hex_32(&secret_text).ok_or(FitConfigurationError::Invalid {
        field,
        reason: "secret key must contain 64 lowercase hexadecimal characters",
    })?;
    let public_key = SigningKey::from_bytes(&secret).verifying_key().to_bytes();
    let expected =
        decode_hex_32(&document.expected_public_key).ok_or(FitConfigurationError::Invalid {
            field,
            reason: "expected public key must contain 64 lowercase hexadecimal characters",
        })?;
    if public_key != expected {
        return Err(FitConfigurationError::Invalid {
            field,
            reason: "secret key does not derive the expected public key",
        });
    }
    Ok(LoadedFitAuthority {
        authority: document.authority.clone(),
        secret,
        public_key,
    })
}

fn load_external_authority(
    directory: &Utf8Path,
    field: &'static str,
    document: &FitExternalAuthorityV1,
) -> Result<LoadedExternalAuthority, FitConfigurationError> {
    validate_authority_name(field, &document.authority)?;
    let public_key =
        decode_hex_32(&document.expected_public_key).ok_or(FitConfigurationError::Invalid {
            field,
            reason: "expected public key must contain 64 lowercase hexadecimal characters",
        })?;
    let issuer_command = canonical_existing_beneath(directory, &document.issuer_command, field)?;
    let metadata = fs::metadata(&issuer_command).map_err(|source| FitConfigurationError::Io {
        path: issuer_command.clone(),
        source,
    })?;
    if !metadata.is_file() {
        return Err(FitConfigurationError::Invalid {
            field,
            reason: "external issuer command must be a regular executable file",
        });
    }
    #[cfg(unix)]
    if metadata.permissions().mode() & 0o111 == 0 {
        return Err(FitConfigurationError::Invalid {
            field,
            reason: "external issuer command must have an executable mode bit",
        });
    }
    Ok(LoadedExternalAuthority {
        authority: document.authority.clone(),
        issuer_command,
        public_key,
    })
}

fn validate_authority_name(
    field: &'static str,
    authority: &str,
) -> Result<(), FitConfigurationError> {
    if authority.is_empty()
        || authority.trim() != authority
        || authority.eq_ignore_ascii_case("TBD")
    {
        return Err(FitConfigurationError::Invalid {
            field,
            reason: "authority name is not canonical",
        });
    }
    Ok(())
}

fn bundle_references(bundle: &FitInputBundleV1) -> Vec<(&'static str, &FitInputReferenceV1)> {
    let mut references = vec![
        ("relationPolicyInputs", &bundle.relation_policy_inputs),
        ("classifier", &bundle.classifier),
        ("relationPolicyReport", &bundle.relation_policy_report),
        ("securityApprovalReport", &bundle.security_approval_report),
        ("companion", &bundle.companion),
        (
            "companionCompatibilityReport",
            &bundle.companion_compatibility_report,
        ),
    ];
    if let Some(strength_head) = &bundle.strength_head {
        references.push(("strengthHead", strength_head));
    }
    references
}

fn resolve_relative(
    directory: &Utf8Path,
    path: &Utf8Path,
    field: &'static str,
) -> Result<Utf8PathBuf, FitConfigurationError> {
    if path.is_absolute() {
        Ok(path.to_owned())
    } else {
        resolve_beneath(directory, path, field)
    }
}

fn resolve_beneath(
    root: &Utf8Path,
    path: &Utf8Path,
    field: &'static str,
) -> Result<Utf8PathBuf, FitConfigurationError> {
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Utf8Component::CurDir | Utf8Component::Normal(_)))
    {
        return Err(FitConfigurationError::PathEscape {
            field,
            path: path.to_owned(),
        });
    }
    Ok(root.join(path))
}

fn canonical_existing_beneath(
    root: &Utf8Path,
    path: &Utf8Path,
    field: &'static str,
) -> Result<Utf8PathBuf, FitConfigurationError> {
    let lexical = resolve_beneath(root, path, field)?;
    let canonical_root = canonicalize_utf8(root)?;
    let canonical_path = canonicalize_utf8(&lexical)?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err(FitConfigurationError::PathEscape {
            field,
            path: lexical,
        });
    }
    Ok(canonical_path)
}

fn canonicalize_utf8(path: &Utf8Path) -> Result<Utf8PathBuf, FitConfigurationError> {
    let canonical = fs::canonicalize(path).map_err(|source| FitConfigurationError::Io {
        path: path.to_owned(),
        source,
    })?;
    Utf8PathBuf::from_path_buf(canonical).map_err(|_path| FitConfigurationError::Invalid {
        field: "path",
        reason: "resolved paths must use UTF-8",
    })
}

fn read_secret_text(path: &Utf8Path) -> Result<String, FitConfigurationError> {
    let mut file = open_file(path)?;
    let metadata = file
        .metadata()
        .map_err(|source| FitConfigurationError::Io {
            path: path.to_owned(),
            source,
        })?;
    validate_secret_permissions(path, &metadata)?;
    let bytes = read_bounded_file(path, &mut file, &metadata, MAXIMUM_SECRET_BYTES)?;
    let text = core::str::from_utf8(&bytes).map_err(|_error| FitConfigurationError::Invalid {
        field: "secret",
        reason: "secret files must be UTF-8",
    })?;
    let text = text.strip_suffix('\n').unwrap_or(text);
    if text.is_empty() || text.contains('\n') || text.contains('\r') {
        return Err(FitConfigurationError::Invalid {
            field: "secret",
            reason: "secret files must contain one non-empty line",
        });
    }
    Ok(text.to_owned())
}

fn read_bounded(path: &Utf8Path, maximum: u64) -> Result<Vec<u8>, FitConfigurationError> {
    let mut file = open_file(path)?;
    let metadata = file
        .metadata()
        .map_err(|source| FitConfigurationError::Io {
            path: path.to_owned(),
            source,
        })?;
    read_bounded_file(path, &mut file, &metadata, maximum)
}

fn read_bounded_file(
    path: &Utf8Path,
    file: &mut fs::File,
    metadata: &fs::Metadata,
    maximum: u64,
) -> Result<Vec<u8>, FitConfigurationError> {
    if !metadata.is_file() || metadata.len() > maximum {
        return Err(FitConfigurationError::Invalid {
            field: "file",
            reason: "input is not a bounded regular file",
        });
    }
    let mut bytes = Vec::new();
    file.take(maximum.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|source| FitConfigurationError::Io {
            path: path.to_owned(),
            source,
        })?;
    if u64::try_from(bytes.len()).map_or(true, |length| length > maximum) {
        return Err(FitConfigurationError::Invalid {
            field: "file",
            reason: "input is not a bounded regular file",
        });
    }
    Ok(bytes)
}

fn open_file(path: &Utf8Path) -> Result<fs::File, FitConfigurationError> {
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt as _;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    options
        .open(path)
        .map_err(|source| FitConfigurationError::Io {
            path: path.to_owned(),
            source,
        })
}

#[cfg(unix)]
fn validate_secret_permissions(
    path: &Utf8Path,
    metadata: &fs::Metadata,
) -> Result<(), FitConfigurationError> {
    let mode = metadata.permissions().mode() & 0o777;
    if matches!(mode, 0o400 | 0o600) {
        Ok(())
    } else {
        Err(FitConfigurationError::SecretPermissions {
            path: path.to_owned(),
            mode,
        })
    }
}

#[cfg(not(unix))]
fn validate_secret_permissions(
    _path: &Utf8Path,
    _metadata: &fs::Metadata,
) -> Result<(), FitConfigurationError> {
    Ok(())
}

fn validate_sha256(field: &'static str, value: &str) -> Result<(), FitConfigurationError> {
    if decode_hex_32(value).is_some() {
        Ok(())
    } else {
        Err(FitConfigurationError::Invalid {
            field,
            reason: "must contain 64 lowercase hexadecimal characters",
        })
    }
}

fn decode_hex_32(value: &str) -> Option<[u8; 32]> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return None;
    }
    let mut output = [0; 32];
    for (index, pair) in value.as_bytes().chunks_exact(2).enumerate() {
        let [high, low] = pair else {
            return None;
        };
        output[index] = (decode_nibble(*high)? << 4) | decode_nibble(*low)?;
    }
    Some(output)
}

const fn decode_nibble(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        _ => None,
    }
}

pub(crate) fn encode_hex(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use core::fmt::Write as _;
        write!(output, "{byte:02x}").expect("writing to a string should succeed");
    }
    output
}

#[cfg(test)]
#[path = "config/tests.rs"]
mod tests;
