use alloc::sync::Arc;
use core::error::Error;
use std::path::Path;

use error_stack::{Report, ResultExt as _};
use rustls::{
    ClientConfig, RootCertStore,
    crypto::aws_lc_rs,
    pki_types::{CertificateDer, pem::PemObject as _},
};
use tokio_postgres_rustls::MakeRustlsConnect;

#[derive(Debug, derive_more::Display)]
#[display("could not load the root certificate")]
pub struct RootCertificateError;

impl Error for RootCertificateError {}

/// Loads the PEM-encoded certificates in `path`.
///
/// # Errors
///
/// Returns [`RootCertificateError`] if `path` cannot be read or holds no valid certificate.
pub(crate) fn load_root_certificates(
    path: &Path,
) -> Result<RootCertStore, Report<RootCertificateError>> {
    let mut roots = RootCertStore::empty();
    for certificate in CertificateDer::pem_file_iter(path).change_context(RootCertificateError)? {
        roots
            .add(certificate.change_context(RootCertificateError)?)
            .change_context(RootCertificateError)?;
    }

    if roots.is_empty() {
        return Err(Report::new(RootCertificateError).attach("the file contains no certificate"));
    }
    Ok(roots)
}

/// Creates a connector that verifies the server against `roots`.
pub(crate) fn connector(roots: RootCertStore) -> MakeRustlsConnect {
    let config = ClientConfig::builder_with_provider(Arc::new(aws_lc_rs::default_provider()))
        .with_safe_default_protocol_versions()
        .expect("aws-lc-rs should support the default protocol versions")
        .with_root_certificates(roots)
        .with_no_client_auth();
    MakeRustlsConnect::new(config)
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::load_root_certificates;

    #[test]
    fn missing_file() {
        assert!(
            load_root_certificates(Path::new("/nonexistent/root.pem")).is_err(),
            "a missing file should be rejected"
        );
    }

    #[test]
    fn file_without_certificate() {
        let not_pem = Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
        assert!(
            load_root_certificates(&not_pem).is_err(),
            "a file without a certificate should be rejected"
        );
    }
}
