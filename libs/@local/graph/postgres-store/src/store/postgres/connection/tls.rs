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
pub enum RootCertificateError {
    /// TLS is enabled, but no root certificate is configured.
    #[display("TLS is enabled without a root certificate")]
    Missing,
    /// The root certificate file could not be opened.
    #[display("the root certificate file could not be read")]
    Read,
    /// The root certificate file is not valid PEM.
    #[display("the root certificate file could not be parsed")]
    Parse,
    /// A certificate in the file was rejected.
    #[display("the root certificate is invalid")]
    Invalid,
    /// The root certificate file contains no certificate.
    #[display("the root certificate file contains no certificate")]
    Empty,
}

impl Error for RootCertificateError {}

/// Loads the PEM-encoded certificates in `path`.
///
/// # Errors
///
/// - [`Read`] if `path` cannot be opened
/// - [`Parse`] if `path` is not valid PEM
/// - [`Invalid`] if a certificate in `path` is rejected
/// - [`Empty`] if `path` contains no certificate
///
/// [`Read`]: RootCertificateError::Read
/// [`Parse`]: RootCertificateError::Parse
/// [`Invalid`]: RootCertificateError::Invalid
/// [`Empty`]: RootCertificateError::Empty
pub(crate) fn load_root_certificates(
    path: &Path,
) -> Result<RootCertStore, Report<RootCertificateError>> {
    let mut roots = RootCertStore::empty();
    for certificate in
        CertificateDer::pem_file_iter(path).change_context(RootCertificateError::Read)?
    {
        roots
            .add(certificate.change_context(RootCertificateError::Parse)?)
            .change_context(RootCertificateError::Invalid)?;
    }

    if roots.is_empty() {
        return Err(Report::new(RootCertificateError::Empty));
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

    use super::{RootCertificateError, load_root_certificates};

    #[test]
    fn missing_file() {
        let report = load_root_certificates(Path::new("/nonexistent/root.pem"))
            .expect_err("a missing file should be rejected");
        assert!(
            matches!(report.current_context(), RootCertificateError::Read),
            "a missing file should fail to be read"
        );
    }

    #[test]
    fn file_without_certificate() {
        let not_pem = Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
        let report = load_root_certificates(&not_pem)
            .expect_err("a file without a certificate should be rejected");
        assert!(
            matches!(report.current_context(), RootCertificateError::Empty),
            "a file without a certificate should be reported as empty"
        );
    }
}
