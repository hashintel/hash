//! Command-line envelope for fitting and serving Atlas generations.
//!
//! `fit` delegates to an injected [`AtlasTrainer`], keeping extraction and
//! deployment policy outside the crate-level CLI. `serve` is complete: it
//! starts the Axum 0.8 router over cryptographically verified active state.

use core::{error::Error, fmt, future::Future, net::SocketAddr, pin::Pin};
use std::{
    fs::File,
    io::{self, Read as _, Write as _},
};

#[expect(
    deprecated,
    reason = "Candle CPU remains the pinned M0 checkpoint-serving backend"
)]
use burn::backend::{Candle, candle::CandleDevice};
use bytes::Bytes;
use camino::{Utf8Path, Utf8PathBuf};
use clap::{Parser, Subcommand, error::ErrorKind};
use serde::Serialize;

use crate::api::{AtlasApiConfiguration, AtlasApiState, router};

const MAX_COMMAND_JSON_BYTES: u64 = 16 * 1024 * 1024;

/// Top-level HASH Graph Atlas command.
#[derive(Debug, Parser)]
#[command(name = "hash-graph-atlas", version, about)]
pub struct AtlasCommand {
    #[command(subcommand)]
    command: AtlasSubcommand,
}

/// Supported Atlas process modes.
#[derive(Debug, Subcommand)]
enum AtlasSubcommand {
    /// Fit, verify, publish, activate, and reopen one generation.
    Fit(FitCommand),
    /// Serve the currently active generation over HTTP.
    Serve(ServeCommand),
}

/// Input to an injected production fitting adapter.
pub struct FitRequest {
    source: Utf8PathBuf,
    bytes: Bytes,
}

impl FitRequest {
    /// Returns the path from which the request was loaded.
    #[must_use]
    pub fn source(&self) -> &Utf8Path {
        &self.source
    }

    /// Borrows the bounded JSON request bytes.
    #[must_use]
    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }
}

/// Stable command output from one completed fit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FitReceipt {
    pub generation: String,
    pub manifest_hash: String,
    pub release_report_hash: String,
    pub activation: FitActivation,
}

/// Explicit activation result reported by a fitting adapter.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FitActivation {
    Activated,
    AlreadyActive,
}

/// A production adapter capable of running one complete Atlas fit request.
pub trait AtlasTrainer: Send + Sync {
    /// Executes a bounded request loaded by the CLI.
    fn fit(
        &self,
        request: FitRequest,
    ) -> Pin<Box<dyn Future<Output = Result<FitReceipt, AtlasFitError>> + Send + '_>>;
}

/// Closure-backed production fitting adapter.
pub struct CallbackAtlasTrainer<Callback> {
    callback: Callback,
}

impl<Callback> CallbackAtlasTrainer<Callback> {
    /// Wraps a fitting callback for CLI composition.
    #[must_use]
    pub const fn new(callback: Callback) -> Self {
        Self { callback }
    }
}

impl<Callback, FitFuture> AtlasTrainer for CallbackAtlasTrainer<Callback>
where
    Callback: Fn(FitRequest) -> FitFuture + Send + Sync,
    FitFuture: Future<Output = Result<FitReceipt, AtlasFitError>> + Send + 'static,
{
    fn fit(
        &self,
        request: FitRequest,
    ) -> Pin<Box<dyn Future<Output = Result<FitReceipt, AtlasFitError>> + Send + '_>> {
        Box::pin((self.callback)(request))
    }
}

/// A fitting-adapter failure suitable for CLI presentation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AtlasFitError {
    detail: String,
}

impl AtlasFitError {
    /// Creates an adapter-owned fitting failure.
    #[must_use]
    pub fn new(detail: impl Into<String>) -> Self {
        Self {
            detail: detail.into(),
        }
    }
}

impl fmt::Display for AtlasFitError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.detail)
    }
}

impl Error for AtlasFitError {}

/// Default fitting adapter used by the standalone serving binary.
///
/// Applications should replace this with [`CallbackAtlasTrainer`] or their
/// own typed [`AtlasTrainer`] implementation.
#[derive(Debug, Default, Copy, Clone)]
pub struct UnconfiguredAtlasTrainer;

impl AtlasTrainer for UnconfiguredAtlasTrainer {
    fn fit(
        &self,
        _request: FitRequest,
    ) -> Pin<Box<dyn Future<Output = Result<FitReceipt, AtlasFitError>> + Send + '_>> {
        Box::pin(core::future::ready(Err(AtlasFitError::new(
            "no Atlas fitting adapter is configured for this binary",
        ))))
    }
}

/// Parses process arguments and runs the selected command.
///
/// # Errors
///
/// Returns an error when argument parsing, bounded input loading, fitting,
/// trust configuration, listener setup, or HTTP serving fails.
pub async fn run_with<Arguments, Argument, Trainer>(
    arguments: Arguments,
    trainer: &Trainer,
) -> Result<(), AtlasCliError>
where
    Arguments: IntoIterator<Item = Argument>,
    Argument: Into<std::ffi::OsString> + Clone,
    Trainer: AtlasTrainer + ?Sized,
{
    let command = match AtlasCommand::try_parse_from(arguments) {
        Ok(command) => command,
        Err(error)
            if matches!(
                error.kind(),
                ErrorKind::DisplayHelp | ErrorKind::DisplayVersion
            ) =>
        {
            error
                .print()
                .map_err(|error| AtlasCliError::new("could not display Atlas help", error))?;
            return Ok(());
        }
        Err(error) => {
            return Err(AtlasCliError::new("invalid Atlas command", error));
        }
    };
    run(command, trainer).await
}

/// Runs an already parsed Atlas command.
///
/// # Errors
///
/// Returns an error when fitting or serving cannot complete.
pub async fn run<Trainer>(command: AtlasCommand, trainer: &Trainer) -> Result<(), AtlasCliError>
where
    Trainer: AtlasTrainer + ?Sized,
{
    match command.command {
        AtlasSubcommand::Fit(command) => run_fit(command, trainer).await,
        AtlasSubcommand::Serve(command) => run_server(command).await,
    }
}

#[derive(Debug, clap::Args)]
struct FitCommand {
    /// JSON request consumed by the configured fitting adapter.
    #[arg(long)]
    request: Utf8PathBuf,
}

#[derive(Debug, clap::Args)]
struct ServeCommand {
    /// JSON file containing Atlas root and release verification keys.
    #[arg(long)]
    config: Utf8PathBuf,
    /// TCP address for the Axum listener.
    #[arg(long, default_value = "127.0.0.1:4010")]
    bind: SocketAddr,
}

async fn run_fit<Trainer>(command: FitCommand, trainer: &Trainer) -> Result<(), AtlasCliError>
where
    Trainer: AtlasTrainer + ?Sized,
{
    let bytes = read_bounded(&command.request, MAX_COMMAND_JSON_BYTES)?;
    serde_json::from_slice::<serde_json::Value>(&bytes)
        .map_err(|error| AtlasCliError::new("Atlas fit request is not valid JSON", error))?;
    let receipt = trainer
        .fit(FitRequest {
            source: command.request,
            bytes: Bytes::from(bytes),
        })
        .await
        .map_err(|error| AtlasCliError::new("Atlas fit failed", error))?;
    let stdout = io::stdout();
    let mut output = stdout.lock();
    serde_json::to_writer(&mut output, &receipt)
        .map_err(|error| AtlasCliError::new("could not encode Atlas fit receipt", error))?;
    output
        .write_all(b"\n")
        .map_err(|error| AtlasCliError::new("could not write Atlas fit receipt", error))
}

#[expect(
    deprecated,
    reason = "Candle CPU remains the pinned M0 checkpoint-serving backend"
)]
async fn run_server(command: ServeCommand) -> Result<(), AtlasCliError> {
    let configuration = read_bounded(&command.config, MAX_COMMAND_JSON_BYTES)?;
    let configuration = serde_json::from_slice::<AtlasApiConfiguration>(&configuration)
        .map_err(|error| AtlasCliError::new("Atlas API configuration is invalid", error))?;
    let state = AtlasApiState::<Candle>::new(configuration, CandleDevice::Cpu)
        .map_err(|error| AtlasCliError::new("Atlas API trust configuration is invalid", error))?;
    let listener = tokio::net::TcpListener::bind(command.bind)
        .await
        .map_err(|error| AtlasCliError::new("could not bind Atlas API listener", error))?;
    axum::serve(listener, router(state))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|error| AtlasCliError::new("Atlas API server failed", error))
}

async fn shutdown_signal() {
    let control_c = async {
        let _result = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    {
        let terminate = async {
            match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
                Ok(mut signal) => {
                    signal.recv().await;
                }
                Err(_error) => core::future::pending().await,
            }
        };
        tokio::select! {
            () = control_c => {}
            () = terminate => {}
        }
    }

    #[cfg(not(unix))]
    control_c.await;
}

fn read_bounded(path: &Utf8Path, maximum: u64) -> Result<Vec<u8>, AtlasCliError> {
    let mut file = File::open(path)
        .map_err(|error| AtlasCliError::new(format!("could not open {path}"), error))?;
    if !file
        .metadata()
        .map_err(|error| AtlasCliError::new(format!("could not inspect {path}"), error))?
        .is_file()
    {
        return Err(AtlasCliError::message(format!(
            "{path} is not a regular file"
        )));
    }
    let mut bytes = Vec::new();
    std::io::Read::by_ref(&mut file)
        .take(maximum.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|error| AtlasCliError::new(format!("could not read {path}"), error))?;
    if match u64::try_from(bytes.len()) {
        Ok(length) => length > maximum,
        Err(_error) => true,
    } {
        return Err(AtlasCliError::message(format!(
            "{path} exceeds the {maximum}-byte command input limit"
        )));
    }
    Ok(bytes)
}

/// A command-line setup or execution failure.
#[derive(Debug)]
pub struct AtlasCliError {
    detail: String,
    source: Option<Box<dyn Error + Send + Sync>>,
}

impl AtlasCliError {
    fn new(detail: impl Into<String>, source: impl Error + Send + Sync + 'static) -> Self {
        Self {
            detail: detail.into(),
            source: Some(Box::new(source)),
        }
    }

    fn message(detail: impl Into<String>) -> Self {
        Self {
            detail: detail.into(),
            source: None,
        }
    }
}

impl fmt::Display for AtlasCliError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.detail)?;
        if let Some(source) = &self.source {
            write!(formatter, ": {source}")?;
        }
        Ok(())
    }
}

impl Error for AtlasCliError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        self.source
            .as_deref()
            .map(|source| source as &(dyn Error + 'static))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_schema_accepts_fit_and_serve() {
        assert!(
            AtlasCommand::try_parse_from(["atlas", "fit", "--request", "request.json"]).is_ok()
        );
        assert!(
            AtlasCommand::try_parse_from(["atlas", "serve", "--config", "server.json"]).is_ok()
        );
    }
}
