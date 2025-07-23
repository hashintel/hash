//! # HASH Graph Postgres queries
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]

use core::{error::Error, time::Duration};
use std::path::PathBuf;

use bytes::{Buf, BufMut, Bytes, BytesMut};
use hash_telemetry::{
    OtlpConfig, TracingConfig,
    logging::{
        ColorOption, ConsoleConfig, ConsoleStream, FileConfig, FileRotation, LogFormat,
        LoggingConfig,
    },
    traces::sentry::{SentryConfig, SentryEnvironment},
};
use pgwire::messages::{
    DecodeContext, Message, PgWireBackendMessage, PgWireFrontendMessage, ProtocolVersion,
    startup::Startup,
};
use postgres_protocol::authentication::sasl::{ChannelBinding, SCRAM_SHA_256, ScramSha256};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};
use tracing::Level;

async fn read_message(
    stream: &mut TcpStream,
    protocol_version: ProtocolVersion,
) -> Result<Option<PgWireBackendMessage>, Box<dyn Error>> {
    let mut response_buf = BytesMut::new();
    let n = stream.read_buf(&mut response_buf).await?;
    tracing::info!("Received response: {n} bytes");
    tracing::info!("Response bytes: {:?}", &response_buf[..n]);

    // Ensure we have the complete message
    if n >= 5 && response_buf[0] == b'R' {
        let msg_len = (&response_buf[1..5]).get_i32() as usize;
        let total_len = msg_len + 1; // +1 for message type byte

        // Read more data if needed
        while response_buf.len() < total_len {
            let additional = stream.read_buf(&mut response_buf).await?;
            if additional == 0 {
                break; // EOF
            }
            tracing::info!("Read additional {} bytes", additional);
        }
    }

    match PgWireBackendMessage::decode(&mut response_buf, &DecodeContext::new(protocol_version)) {
        Ok(message) => {
            tracing::info!("Decode result: {:?}", message);
            if message.is_none() {
                tracing::info!("No message decoded, checking for error message");
                if let Some(identifier) = response_buf.get(0) {
                    match identifier {
                        b'E' => {
                            tracing::error!("Received PostgreSQL error message");
                            // Try to manually decode the error message
                            let mut buf_copy = response_buf.clone();
                            buf_copy.advance(1); // Skip 'E'
                            let size = buf_copy.get_i32() as usize;
                            tracing::error!("Error message size: {}", size);

                            // Read error fields
                            while buf_copy.has_remaining() && buf_copy[0] != 0 {
                                let field_type = buf_copy.get_u8() as char;
                                let field_value = {
                                    let mut value = Vec::new();
                                    while buf_copy.has_remaining() && buf_copy[0] != 0 {
                                        value.push(buf_copy.get_u8());
                                    }
                                    if buf_copy.has_remaining() {
                                        buf_copy.advance(1); // Skip null terminator
                                    }
                                    String::from_utf8_lossy(&value).to_string()
                                };
                                tracing::error!("Error field {}: {}", field_type, field_value);
                            }
                        }
                        _ => {
                            tracing::error!(
                                "Unexpected message identifier: {:?}: {:?}",
                                identifier,
                                response_buf
                            );
                            if n > 5 {
                                let size = response_buf.get_i32() as usize;
                                response_buf.advance(size - 4);
                            }
                        }
                    }
                }
                if let Some(&b'E') = response_buf.get(0) {}
            }
            Ok(message)
        }
        Err(e) => {
            tracing::error!("Decode error: {:?}", e);
            tracing::error!("Remaining buffer: {:?}", response_buf);
            Err(e.into())
        }
    }
}

#[expect(clippy::too_many_lines)]
#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let _guard = hash_telemetry::init_tracing(
        TracingConfig {
            logging: LoggingConfig {
                console: ConsoleConfig {
                    enabled: true,
                    format: LogFormat::Pretty,
                    color: ColorOption::Auto,
                    level: None,
                    stream: ConsoleStream::Stderr,
                },
                file: FileConfig {
                    enabled: false,
                    format: LogFormat::Json,
                    level: None,
                    output: PathBuf::from("./logs"),
                    rotation: FileRotation::default(),
                },
            },
            otlp: OtlpConfig {
                endpoint: Some("http://localhost:4317".to_owned()),
            },
            sentry: SentryConfig {
                dsn: None,
                environment: SentryEnvironment::Development,
                enable_span_attributes: true,
                event_filter: Level::INFO,
                span_filter: Level::INFO,
            },
        },
        "Postgres Client",
    )?;

    tracing::info!("Starting PostgreSQL client experiment...");

    let mut protocol_version = ProtocolVersion::default();

    // Let's try to connect to a local PostgreSQL instance
    let mut stream = TcpStream::connect("127.0.0.1:5432").await?;
    tracing::info!("Connected to PostgreSQL server!");

    // Create a startup message using pgwire
    let mut startup = Startup::new();
    let (major, minor) = protocol_version.version_number();
    startup.protocol_number_major = major;
    startup.protocol_number_minor = minor;
    startup.parameters.extend([
        ("user".to_owned(), "postgres".to_owned()),
        ("database".to_owned(), "postgres".to_owned()),
    ]);

    // Encode the message
    let mut buf = BytesMut::new();
    let frontend_message = PgWireFrontendMessage::Startup(startup);
    frontend_message.encode(&mut buf)?;

    tracing::info!("Sending startup message: {} bytes", buf.len());

    // Send the startup message
    stream.write_all(&buf).await?;

    // Read response
    let mut response_buf = BytesMut::new();
    let n = stream.read_buf(&mut response_buf).await?;
    tracing::info!("Received response: {n} bytes");
    tracing::info!("Response bytes: {:?}", &response_buf[..n]);

    // Skip the unknown message type 'v' and jump to the Authentication message
    if n > 0 && response_buf[0] == b'v' {
        response_buf.advance(1);
        let size = response_buf.get_i32() as usize;
        let version = response_buf.get_i32() as u16;
        if let Some(version) =
            ProtocolVersion::from_version_number(protocol_version.version_number().0, version)
        {
            protocol_version = version;

            tracing::info!("Negotiated protocol version: {protocol_version:?}");
        } else {
            tracing::warn!(
                "Unsupported protocol version: {}.{}",
                protocol_version.version_number().0,
                version
            );
        }

        response_buf.advance(size - 8);
    }

    // Now try to decode the remaining message (should be Authentication)
    match PgWireBackendMessage::decode(&mut response_buf, &DecodeContext::new(protocol_version)) {
        Ok(Some(message)) => {
            tracing::info!("🎉 Successfully decoded message: {:?}", message);

            // Handle SCRAM-SHA-256 authentication
            if let PgWireBackendMessage::Authentication(auth_message) = message {
                use pgwire::messages::startup::Authentication;
                match auth_message {
                    Authentication::SASL(mechanisms) => {
                        if mechanisms.contains(&SCRAM_SHA_256.to_string()) {
                            tracing::info!("Starting SCRAM-SHA-256 authentication...");

                            // Create SCRAM client with correct API
                            let password = "postgres"; // TODO: Make configurable
                            let channel_binding = ChannelBinding::unrequested();
                            let mut scram = ScramSha256::new(password.as_bytes(), channel_binding);

                            // Get initial client message
                            let client_first = Bytes::from_owner(scram.message().to_vec());
                            tracing::info!(
                                "Sending SCRAM client first: {} bytes: {:?}",
                                client_first.len(),
                                client_first
                            );

                            // Send SASL Initial Response
                            let mut sasl_response = BytesMut::new();
                            sasl_response.put_u8(b'p'); // SASLInitialResponse message type
                            let auth_method = SCRAM_SHA_256.to_string();
                            let message_len = 4 + auth_method.len() + 1 + 4 + client_first.len();
                            sasl_response.put_i32(message_len as i32);

                            // Auth method name (null-terminated)
                            sasl_response.put_slice(auth_method.as_bytes());
                            sasl_response.put_u8(0);

                            // Data length and data
                            sasl_response.put_i32(client_first.len() as i32);
                            sasl_response.put_slice(&client_first);

                            stream.write_all(&sasl_response).await?;
                            tracing::info!("Sent SASL Initial Response");

                            // Wait for SASL Continue message
                            if let Some(message) =
                                read_message(&mut stream, protocol_version).await?
                            {
                                tracing::info!("Received SASL message: {:?}", message);

                                if let PgWireBackendMessage::Authentication(auth_msg) = message {
                                    use pgwire::messages::startup::Authentication;
                                    match auth_msg {
                                        Authentication::SASLContinue(server_data) => {
                                            tracing::info!(
                                                "Processing SASL Continue with {} bytes",
                                                server_data.len()
                                            );

                                            // Update SCRAM with server's response
                                            scram.update(&server_data)?;
                                            let client_final = scram.message();

                                            // Send SASL Response
                                            let mut final_response = BytesMut::new();
                                            final_response.put_u8(b'p'); // SASLResponse message type
                                            final_response.put_i32((4 + client_final.len()) as i32);
                                            final_response.put(client_final);

                                            stream.write_all(&final_response).await?;
                                            tracing::info!("Sent SASL Response");

                                            loop {
                                                // Wait for SASL Final
                                                if let Some(final_msg) =
                                                    read_message(&mut stream, protocol_version)
                                                        .await?
                                                {
                                                    tracing::info!(
                                                        "Received message: {:?}",
                                                        final_msg
                                                    );
                                                }
                                            }
                                        }
                                        _ => {
                                            tracing::error!(
                                                "Expected SASL Continue, got: {:?}",
                                                auth_msg
                                            );
                                        }
                                    }
                                }
                            }
                        } else {
                            tracing::error!("SCRAM-SHA-256 not supported by server");
                        }
                    }
                    _ => {
                        tracing::warn!("Unexpected authentication type: {:?}", auth_message);
                    }
                }
            }
        }
        Ok(None) => {
            tracing::warn!("Need more data to complete message");
        }
        Err(e) => {
            tracing::warn!("Failed to decode message: {:?}", e);
            tracing::warn!("Remaining buffer: {:?}", response_buf);
        }
    }

    Ok(())
}
