use core::{
    fmt::Write as _,
    marker::PhantomPinned,
    net::SocketAddr,
    pin::Pin,
    str,
    task::{Context, Poll},
    time::Duration,
};
use std::{env, fs, io};

use aws_sdk_s3::{
    Client,
    config::{BehaviorVersion, Credentials, Region, retry::RetryConfig},
};
use axum::http::{Request, header};
use camino::{Utf8Path, Utf8PathBuf};
use tokio::{
    io::{AsyncReadExt as _, AsyncWrite, AsyncWriteExt as _},
    net::{TcpListener, TcpStream},
    sync::oneshot,
    task::JoinHandle,
};
use uuid::Uuid;

use super::{Storage, s3::S3};

pub(super) struct TemporaryDirectory {
    path: Utf8PathBuf,
}

impl TemporaryDirectory {
    #[expect(
        clippy::create_dir,
        reason = "the fixture must refuse an existing directory rather than reuse it"
    )]
    pub(super) fn new() -> Self {
        let path = Utf8PathBuf::from_path_buf(env::temp_dir())
            .expect("should have a UTF-8 temporary directory")
            .join(format!("atlas-storage-test-{}", Uuid::now_v7()));
        fs::create_dir(&path).expect("should create the fixture directory");
        Self { path }
    }

    pub(super) fn path(&self) -> &Utf8Path {
        &self.path
    }

    pub(super) fn entry_count(&self) -> usize {
        fs::read_dir(&self.path)
            .expect("should read the fixture directory")
            .count()
    }
}

impl Drop for TemporaryDirectory {
    fn drop(&mut self) {
        drop(fs::remove_dir_all(&self.path));
    }
}

async fn read_request(socket: &mut TcpStream) -> Request<Vec<u8>> {
    let mut buffer = Vec::new();
    let head_end = loop {
        if let Some(position) = buffer.windows(4).position(|window| window == b"\r\n\r\n") {
            break position + 4;
        }
        assert!(
            buffer.len() < 0x0001_0000,
            "request headers should fit in the fixture buffer"
        );
        assert_ne!(
            socket
                .read_buf(&mut buffer)
                .await
                .expect("should read request headers"),
            0,
            "the client should send complete request headers"
        );
    };
    let head = str::from_utf8(&buffer[..head_end - 4]).expect("should receive ASCII headers");
    let mut lines = head.split("\r\n");
    let mut start = lines
        .next()
        .expect("should receive a request line")
        .split_whitespace();
    let mut request = Request::builder()
        .method(start.next().expect("should receive a method"))
        .uri(start.next().expect("should receive a target"));
    assert_eq!(start.next(), Some("HTTP/1.1"));
    for line in lines {
        let (name, value) = line.split_once(':').expect("should receive a header field");
        request = request.header(name, value.trim());
    }
    let headers = request
        .headers_ref()
        .expect("should build valid request headers");
    assert!(
        !headers.contains_key(header::TRANSFER_ENCODING),
        "the fixture should receive fixed-length requests"
    );
    let length = headers.get(header::CONTENT_LENGTH).map_or(0, |value| {
        value
            .to_str()
            .expect("should receive a decimal length")
            .parse::<usize>()
            .expect("should parse the body length")
    });
    while buffer.len() < head_end + length {
        assert_ne!(
            socket
                .read_buf(&mut buffer)
                .await
                .expect("should read the request body"),
            0,
            "the client should send its complete body"
        );
    }
    request
        .body(buffer[head_end..head_end + length].to_vec())
        .expect("should construct the captured request")
}

pub(super) struct LoopbackServer {
    address: SocketAddr,
    stop: Option<oneshot::Sender<()>>,
    task: JoinHandle<Vec<Request<Vec<u8>>>>,
}

impl LoopbackServer {
    pub(super) async fn start(response: Vec<u8>) -> Self {
        Self::start_paused(response, None).await
    }

    pub(super) async fn start_paused(
        response: Vec<u8>,
        mut pause: Option<(usize, oneshot::Receiver<()>)>,
    ) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("should bind a loopback port");
        let address = listener
            .local_addr()
            .expect("should read the bound address");
        let (stop, mut stopped) = oneshot::channel();
        let task = tokio::spawn(async move {
            let mut requests = Vec::new();
            loop {
                let (mut socket, _) = tokio::select! {
                    biased;
                    _ = &mut stopped => break,
                    accepted = listener.accept() => accepted.expect("should accept a request"),
                };
                requests.push(read_request(&mut socket).await);
                if let Some((offset, resume)) = pause.take() {
                    socket
                        .write_all(&response[..offset])
                        .await
                        .expect("should write the initial response bytes");
                    socket
                        .flush()
                        .await
                        .expect("should flush the initial response bytes");
                    resume
                        .await
                        .expect("should observe the initial download bytes");
                    drop(socket.write_all(&response[offset..]).await);
                } else {
                    drop(socket.write_all(&response).await);
                }
                drop(socket.flush().await);
            }
            requests
        });
        Self {
            address,
            stop: Some(stop),
            task,
        }
    }

    pub(super) fn endpoint_url(&self) -> String {
        format!("http://{}", self.address)
    }

    pub(super) async fn finish(mut self) -> Vec<Request<Vec<u8>>> {
        let _ = self
            .stop
            .take()
            .expect("should retain the stop sender")
            .send(());
        (&mut self.task)
            .await
            .expect("should finish the loopback server")
    }
}

impl Drop for LoopbackServer {
    fn drop(&mut self) {
        self.task.abort();
    }
}

fn raw_response<'header>(
    status: &str,
    content_length: usize,
    headers: impl IntoIterator<Item = (&'header str, &'header str)>,
    body: &[u8],
) -> Vec<u8> {
    let mut head = String::new();
    writeln!(head, "{status}\r").expect("should format a status line");
    for (name, value) in headers {
        writeln!(head, "{name}: {value}\r").expect("should format a header");
    }
    write!(
        head,
        "Content-Length: {content_length}\r\nConnection: close\r\n\r\n"
    )
    .expect("should format the response framing");
    let mut response = head.into_bytes();
    response.extend_from_slice(body);
    response
}

pub(super) fn ok_response(body: &[u8], etag: Option<&str>) -> Vec<u8> {
    raw_response(
        "HTTP/1.1 200 OK",
        body.len(),
        etag.map(|value| ("ETag", value)),
        body,
    )
}

pub(super) fn short_body_response(declared_length: usize, body: &[u8]) -> Vec<u8> {
    raw_response("HTTP/1.1 200 OK", declared_length, [], body)
}

pub(super) fn error_response(status: &str, code: &str) -> Vec<u8> {
    let body = format!("<Error><Code>{code}</Code><Message>fixture failure</Message></Error>");
    raw_response(
        status,
        body.len(),
        [("Content-Type", "application/xml")],
        body.as_bytes(),
    )
}

pub(super) fn client(endpoint: &str, attempts: u32) -> Client {
    let credentials = Credentials::new(
        "atlas-test-access-key",
        "atlas-test-secret-key",
        None,
        None,
        "atlas-storage-tests",
    );
    let config = aws_sdk_s3::Config::builder()
        .behavior_version(BehaviorVersion::latest())
        .region(Region::new("us-east-1"))
        .credentials_provider(credentials)
        .endpoint_url(endpoint)
        .force_path_style(true)
        .retry_config(
            RetryConfig::standard()
                .with_max_attempts(attempts)
                .with_initial_backoff(Duration::ZERO),
        )
        .build();
    Client::from_conf(config)
}

pub(super) fn storage(endpoint: &str, scratch: Utf8PathBuf) -> Storage {
    Storage::new(Some(S3::new(client(endpoint, 1))), scratch)
}

pub(super) enum FailureMode {
    Write,
    Flush,
}

pin_project_lite::pin_project! {
    pub(super) struct TestWriter {
        pub bytes: Vec<u8>,
        pub flushes: usize,
        failure: Option<FailureMode>,
        #[pin]
        _pin: PhantomPinned,
    }
}

impl TestWriter {
    pub(super) const fn new(failure: Option<FailureMode>) -> Self {
        Self {
            bytes: Vec::new(),
            flushes: 0,
            failure,
            _pin: PhantomPinned,
        }
    }
}

impl AsyncWrite for TestWriter {
    fn poll_write(
        self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<io::Result<usize>> {
        let this = self.project();
        if matches!(this.failure, Some(FailureMode::Write)) {
            return Poll::Ready(Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "test write failure",
            )));
        }
        this.bytes.extend_from_slice(buf);
        Poll::Ready(Ok(buf.len()))
    }

    fn poll_flush(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let this = self.project();
        if matches!(this.failure, Some(FailureMode::Flush)) {
            return Poll::Ready(Err(io::Error::other("test flush failure")));
        }
        *this.flushes += 1;
        Poll::Ready(Ok(()))
    }

    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        self.poll_flush(cx)
    }
}
