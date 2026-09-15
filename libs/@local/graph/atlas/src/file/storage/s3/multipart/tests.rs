use core::{
    assert_matches,
    cell::{Cell, RefCell},
    future::{poll_fn, ready},
    pin::pin,
    task::{Context, Poll, Waker},
};
use std::io;

use aws_sdk_s3::types::{CompletedMultipartUpload, CompletedPart};

use super::{Backend, Multipart, parts::Part};
use crate::file::storage::error::StorageError;

const TWO_PARTS: u64 = 5 * 1024 * 1024 + 1;

/// An observed transfer operation or abort-completion boundary.
#[derive(Debug, PartialEq)]
enum Event {
    Start,
    Part(i32),
    Complete,
    AbortStarted,
    AbortFinished,
}

/// The operation selected to return a fixture error.
enum Failure {
    Start,
    Part(i32),
    Complete,
}

/// A fixture upload handle with no external resource.
struct Upload;

/// Controlled transfer failures with observable completion and abort progress.
struct Fixture {
    failure: Option<Failure>,
    events: RefCell<Vec<Event>>,
    completed: RefCell<Option<CompletedMultipartUpload>>,
    abort_ready: Cell<bool>,
}

impl Fixture {
    /// Selects a transfer failure with abort initially ready to complete.
    const fn new(failure: Option<Failure>) -> Self {
        Self {
            failure,
            events: RefCell::new(Vec::new()),
            completed: RefCell::new(None),
            abort_ready: Cell::new(true),
        }
    }
}

impl Backend for &Fixture {
    type Upload = Upload;

    fn start(&mut self) -> impl Future<Output = Result<Upload, StorageError>> {
        self.events.borrow_mut().push(Event::Start);
        if matches!(self.failure, Some(Failure::Start)) {
            return ready(Err(StorageError::MissingUploadId));
        }
        ready(Ok(Upload))
    }

    fn part(
        &mut self,
        _: &Upload,
        part: Part,
    ) -> impl Future<Output = Result<CompletedPart, StorageError>> {
        let number = part.number;
        self.events.borrow_mut().push(Event::Part(number));
        if matches!(self.failure, Some(Failure::Part(failed)) if failed == number) {
            return ready(Err(StorageError::Io(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "fixture part failure",
            ))));
        }
        ready(part.complete(
            Some(format!("etag-{number}")),
            Some(format!("checksum-{number}")),
        ))
    }

    fn complete(
        &mut self,
        _: &Upload,
        parts: CompletedMultipartUpload,
    ) -> impl Future<Output = Result<(), StorageError>> {
        self.events.borrow_mut().push(Event::Complete);
        *self.completed.borrow_mut() = Some(parts);
        if matches!(self.failure, Some(Failure::Complete)) {
            return ready(Err(StorageError::MissingEntityTag));
        }
        ready(Ok(()))
    }

    async fn abort(&mut self, _: &Upload) {
        self.events.borrow_mut().push(Event::AbortStarted);
        poll_fn(|_| {
            if self.abort_ready.get() {
                Poll::Ready(())
            } else {
                Poll::Pending
            }
        })
        .await;
        self.events.borrow_mut().push(Event::AbortFinished);
    }
}

/// Completion receives every part's metadata in transfer order.
#[tokio::test]
async fn transfer_two_parts() {
    let fixture = Fixture::new(None);
    Multipart::new(&fixture, TWO_PARTS)
        .expect("should partition the source")
        .transfer()
        .await
        .expect("should complete the upload");

    assert_eq!(
        *fixture.events.borrow(),
        [
            Event::Start,
            Event::Part(1),
            Event::Part(2),
            Event::Complete
        ],
        "should transfer each part before completing without aborting"
    );
    let completed = fixture.completed.take().expect("should record completion");
    let metadata: Vec<_> = completed
        .parts()
        .iter()
        .map(|part| (part.part_number(), part.e_tag(), part.checksum_crc32()))
        .collect();
    assert_eq!(
        metadata,
        [
            (Some(1), Some("etag-1"), Some("checksum-1")),
            (Some(2), Some("etag-2"), Some("checksum-2")),
        ],
        "should complete with every part's associated metadata in order"
    );
}

/// An object outside multipart bounds fails before any backend operation.
#[test]
fn transfer_oversized() {
    let fixture = Fixture::new(None);
    let error = Multipart::new(&fixture, u64::MAX)
        .err()
        .expect("should refuse an unrepresentable object");
    assert_matches!(error, StorageError::ObjectTooLarge { length: u64::MAX });
    assert!(
        fixture.events.borrow().is_empty(),
        "should refuse before starting"
    );
}

/// Failed creation provides no handle for transfer or abort.
#[tokio::test]
async fn transfer_start_failure() {
    let fixture = Fixture::new(Some(Failure::Start));
    let error = Multipart::new(&fixture, TWO_PARTS)
        .expect("should partition the source")
        .transfer()
        .await
        .expect_err("should retain the creation error");
    assert_matches!(error, StorageError::MissingUploadId);
    assert_eq!(
        *fixture.events.borrow(),
        [Event::Start],
        "should start once without attempting transfer or abort"
    );
}

/// A failed part stops further transfer and preserves its error after abort completes.
#[tokio::test]
async fn transfer_part_failure() {
    for failed in [1, 2] {
        let fixture = Fixture::new(Some(Failure::Part(failed)));
        let error = Multipart::new(&fixture, TWO_PARTS)
            .expect("should partition the source")
            .transfer()
            .await
            .expect_err("should retain the part error");
        assert_matches!(error, StorageError::Io(error) if error.kind() == io::ErrorKind::BrokenPipe);
        let mut expected = vec![Event::Start, Event::Part(1)];
        if failed == 2 {
            expected.push(Event::Part(2));
        }
        expected.extend([Event::AbortStarted, Event::AbortFinished]);
        assert_eq!(
            *fixture.events.borrow(),
            expected,
            "should stop at the failed part and await abort without completing"
        );
        assert!(
            fixture.completed.borrow().is_none(),
            "should leave partial work uncompleted"
        );
    }
}

/// Failed completion preserves its error after abort completes.
#[tokio::test]
async fn transfer_complete_failure() {
    let fixture = Fixture::new(Some(Failure::Complete));
    let error = Multipart::new(&fixture, TWO_PARTS)
        .expect("should partition the source")
        .transfer()
        .await
        .expect_err("should retain the completion error");
    assert_matches!(error, StorageError::MissingEntityTag);
    assert_eq!(
        *fixture.events.borrow(),
        [
            Event::Start,
            Event::Part(1),
            Event::Part(2),
            Event::Complete,
            Event::AbortStarted,
            Event::AbortFinished,
        ],
        "should attempt completion once and await abort"
    );
}

/// The transfer remains pending until abort completes, then returns the original part error.
#[test]
fn transfer_abort_pending() {
    let fixture = Fixture::new(Some(Failure::Part(1)));
    fixture.abort_ready.set(false);
    let mut transfer = pin!(
        Multipart::new(&fixture, TWO_PARTS)
            .expect("should partition the source")
            .transfer()
    );
    let mut context = Context::from_waker(Waker::noop());
    assert_matches!(transfer.as_mut().poll(&mut context), Poll::Pending);
    assert_eq!(
        *fixture.events.borrow(),
        [Event::Start, Event::Part(1), Event::AbortStarted],
        "should await the unfinished abort"
    );

    fixture.abort_ready.set(true);
    assert_matches!(
        transfer.as_mut().poll(&mut context),
        Poll::Ready(Err(StorageError::Io(error))) if error.kind() == io::ErrorKind::BrokenPipe
    );
    assert_eq!(
        *fixture.events.borrow(),
        [
            Event::Start,
            Event::Part(1),
            Event::AbortStarted,
            Event::AbortFinished
        ],
        "should finish cleanup before reporting the transfer failure"
    );
}
