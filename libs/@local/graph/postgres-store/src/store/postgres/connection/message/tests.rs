use alloc::{collections::VecDeque, rc::Rc};
use core::{
    cell::Cell,
    pin::Pin,
    task::{Context, Poll},
};

use futures::{Stream, StreamExt as _, stream::FusedStream as _, task::noop_waker_ref};

use crate::store::postgres::connection::message::MessageStream;

#[derive(Default)]
struct Observed {
    polls: Cell<usize>,
    drops: Cell<usize>,
}

struct Source {
    messages: VecDeque<Poll<Option<Result<u8, &'static str>>>>,
    observed: Rc<Observed>,
}

impl Stream for Source {
    type Item = Result<u8, &'static str>;

    fn poll_next(mut self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.observed.polls.set(self.observed.polls.get() + 1);
        self.messages
            .pop_front()
            .expect("the source should only be polled before termination")
    }
}

impl Drop for Source {
    fn drop(&mut self) {
        self.observed.drops.set(self.observed.drops.get() + 1);
    }
}

fn assert_terminal(terminal: Option<Result<u8, &'static str>>) {
    let observed = Rc::new(Observed::default());
    let prefix = [
        Poll::Pending,
        Poll::Ready(Some(Ok(7))),
        Poll::Pending,
        Poll::Ready(Some(Ok(9))),
    ];
    let mut stream = MessageStream::new(Source {
        messages: prefix.into_iter().chain([Poll::Ready(terminal)]).collect(),
        observed: Rc::clone(&observed),
    });
    let mut context = Context::from_waker(noop_waker_ref());

    assert!(!stream.is_terminated(), "the stream should start active");
    for expected in prefix {
        assert_eq!(
            stream.poll_next_unpin(&mut context),
            expected,
            "the stream should forward pending polls and successful messages"
        );
        assert!(!stream.is_terminated(), "the stream should remain active");
        assert_eq!(observed.drops.get(), 0, "the source should remain alive");
    }
    assert_eq!(
        stream.poll_next_unpin(&mut context),
        Poll::Ready(terminal),
        "the terminal result should be returned once"
    );
    assert!(
        stream.is_terminated(),
        "the stream should terminate immediately"
    );
    assert_eq!(
        observed.drops.get(),
        1,
        "the terminal source should be dropped"
    );

    for _ in 0..3 {
        assert_eq!(
            stream.poll_next_unpin(&mut context),
            Poll::Ready(None),
            "polling the terminated stream should return None"
        );
        assert!(stream.is_terminated(), "termination should be permanent");
    }
    assert_eq!(
        observed.polls.get(),
        prefix.len() + 1,
        "the terminal source should never be polled again"
    );
    drop(stream);
    assert_eq!(
        observed.drops.get(),
        1,
        "the source should be dropped exactly once"
    );
}

#[test]
fn message_end() {
    assert_terminal(None);
}

#[test]
fn message_error() {
    assert_terminal(Some(Err("connection closed")));
}
