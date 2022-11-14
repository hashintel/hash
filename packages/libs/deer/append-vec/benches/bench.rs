//! Benchmark usecases against:
//! * (std) sharded-slab
//! * (std) scc
//! * (std) appendlist
//! * (std) intrusive-collections
//! * (std) im
use std::{
    cell::Cell,
    sync::{Arc, Barrier, Mutex, RwLock},
    thread,
    time::{Duration, Instant},
};

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use deer_append_vec::AppendOnlyVec;
use intrusive_collections::{intrusive_adapter, LinkedListLink};

const N_INSERTIONS: &[usize] = &[100, 300, 500];

// TODO: iter (single, multi)

#[derive(Clone)]
struct MultithreadedBench<T, const N: usize = 5> {
    start: Arc<Barrier>,
    end: Arc<Barrier>,
    value: Arc<T>,
}

impl<T: Send + Sync + 'static, const N: usize> MultithreadedBench<T, N> {
    fn new(slab: Arc<T>) -> Self {
        Self {
            start: Arc::new(Barrier::new(N)),
            end: Arc::new(Barrier::new(N)),
            value: slab,
        }
    }

    fn run(self, f: impl Fn(&Barrier, &T) + Clone + Send + 'static) -> Duration {
        for _ in 0..N - 1 {
            let start = self.start.clone();
            let end = self.end.clone();
            let slab = self.value.clone();
            let f = f.clone();

            thread::spawn(move || {
                f(&start, &*slab);
                end.wait();
            });
        }

        self.start.wait();
        let t0 = Instant::now();
        self.end.wait();
        t0.elapsed()
    }
}

struct Entry {
    link: LinkedListLink,
    value: Cell<usize>,
}

intrusive_adapter!(EntryAdapter = Box<Entry>: Entry {link: LinkedListLink});

fn push_multi_thread(c: &mut Criterion) {
    let mut group = c.benchmark_group("push_multi_thread");

    for i in N_INSERTIONS {
        group.bench_with_input(BenchmarkId::new("sharded_slab", i), i, |b, &i| {
            b.iter_custom(|iters| {
                let mut total = Duration::from_secs(0);

                for _ in 0..iters {
                    let slab = sharded_slab::Slab::<usize>::new();
                    let bench = MultithreadedBench::<_, 5>::new(Arc::new(slab));

                    let elapsed = bench.run(move |start, slab| {
                        start.wait();

                        for idx in 0..i {
                            slab.insert(idx);
                        }
                    });

                    total += elapsed;
                }

                total
            });
        });

        group.bench_with_input(BenchmarkId::new("scc", i), i, |b, &i| {
            b.iter_custom(|iters| {
                let mut total = Duration::from_secs(0);

                for _ in 0..iters {
                    let slab = scc::Queue::<usize>::default();
                    let bench = MultithreadedBench::<_, 5>::new(Arc::new(slab));

                    let elapsed = bench.run(move |start, slab| {
                        start.wait();

                        for idx in 0..i {
                            slab.push(idx);
                        }
                    });

                    total += elapsed;
                }

                total
            });
        });

        group.bench_with_input(BenchmarkId::new("appendlist", i), i, |b, &i| {
            b.iter_custom(|iters| {
                let mut total = Duration::from_secs(0);

                for _ in 0..iters {
                    let slab = Mutex::new(appendlist::AppendList::new());
                    let bench = MultithreadedBench::<_, 5>::new(Arc::new(slab));

                    let elapsed = bench.run(move |start, slab| {
                        start.wait();

                        for idx in 0..i {
                            let guard = slab.lock().unwrap();

                            guard.push(idx);
                        }
                    });

                    total += elapsed;
                }

                total
            });
        });

        group.bench_with_input(BenchmarkId::new("intrusive-collections", i), i, |b, &i| {
            b.iter_custom(|iters| {
                let mut total = Duration::from_secs(0);

                for _ in 0..iters {
                    let slab =
                        Mutex::new(intrusive_collections::LinkedList::new(EntryAdapter::new()));
                    let bench = MultithreadedBench::<_, 5>::new(Arc::new(slab));

                    let elapsed = bench.run(move |start, slab| {
                        start.wait();

                        for idx in 0..i {
                            let mut guard = slab.lock().unwrap();

                            guard.push_back(Box::new(Entry {
                                link: LinkedListLink::new(),
                                value: Cell::new(idx),
                            }));
                        }
                    });

                    total += elapsed;
                }

                total
            });
        });

        group.bench_with_input(BenchmarkId::new("im", i), i, |b, &i| {
            b.iter_custom(|iters| {
                let mut total = Duration::from_secs(0);

                for _ in 0..iters {
                    let slab = RwLock::new(im::Vector::new());
                    let bench = MultithreadedBench::<_, 5>::new(Arc::new(slab));

                    let elapsed = bench.run(move |start, slab| {
                        start.wait();

                        for idx in 0..i {
                            let mut guard = slab.write().unwrap();

                            guard.push_back(idx);
                        }
                    });

                    total += elapsed;
                }

                total
            });
        });

        group.bench_with_input(BenchmarkId::new("deer-append-vec", i), i, |b, &i| {
            b.iter_custom(|iters| {
                let mut total = Duration::from_secs(0);

                for _ in 0..iters {
                    let slab = AppendOnlyVec::<usize>::new();
                    let bench = MultithreadedBench::<_, 5>::new(Arc::new(slab));

                    let elapsed = bench.run(move |start, slab| {
                        start.wait();

                        for idx in 0..i {
                            slab.push(idx);
                        }
                    });

                    total += elapsed;
                }

                total
            });
        });
    }
}

fn push_single_thread(c: &mut Criterion) {
    let mut group = c.benchmark_group("push_single_thread");

    for i in N_INSERTIONS {
        group.bench_with_input(BenchmarkId::new("sharded_slab", i), i, |b, &i| {
            b.iter_with_setup(sharded_slab::Slab::<usize>::new, |slab| {
                for idx in 0..i {
                    slab.insert(idx);
                }
            });
        });

        group.bench_with_input(BenchmarkId::new("scc", i), i, |b, &i| {
            b.iter_with_setup(scc::Queue::<usize>::default, |slab| {
                for idx in 0..i {
                    slab.push(idx);
                }
            });
        });

        group.bench_with_input(BenchmarkId::new("appendlist", i), i, |b, &i| {
            b.iter_with_setup(appendlist::AppendList::<usize>::new, |slab| {
                for idx in 0..i {
                    slab.push(idx);
                }
            });
        });

        group.bench_with_input(BenchmarkId::new("intrusive-collections", i), i, |b, &i| {
            b.iter_with_setup(
                || intrusive_collections::LinkedList::new(EntryAdapter::new()),
                |mut slab| {
                    for idx in 0..i {
                        let entry = Box::new(Entry {
                            link: LinkedListLink::new(),
                            value: Cell::new(idx),
                        });

                        slab.push_back(entry)
                    }
                },
            );
        });

        group.bench_with_input(BenchmarkId::new("im", i), i, |b, &i| {
            b.iter_with_setup(im::Vector::<usize>::default, |mut slab| {
                for idx in 0..i {
                    slab.push_back(idx);
                }
            });
        });

        group.bench_with_input(BenchmarkId::new("deer-append-vec", i), i, |b, &i| {
            b.iter_with_setup(AppendOnlyVec::<usize>::default, |slab| {
                for idx in 0..i {
                    slab.push(idx);
                }
            });
        });
    }
}

fn iter_multi_thread(c: &mut Criterion) {
    let mut group = c.benchmark_group("iter_multi_thread");

    for i in N_INSERTIONS {
        group.bench_with_input(BenchmarkId::new("appendlist", i), i, |b, &i| {
            b.iter_custom(|iters| {
                let mut total = Duration::from_secs(0);

                let slab = appendlist::AppendList::new();
                for idx in 0..i {
                    slab.push(idx);
                }
                let slab = Mutex::new(slab);
                let slab = Arc::new(slab);

                for _ in 0..iters {
                    let bench = MultithreadedBench::<_, 5>::new(Arc::clone(&slab));

                    let elapsed = bench.run(move |start, slab| {
                        start.wait();

                        let lock = slab.lock().unwrap();
                        let _items: Vec<_> = lock.iter().copied().collect();
                    });

                    total += elapsed;
                }

                total
            });
        });

        group.bench_with_input(BenchmarkId::new("intrusive-collections", i), i, |b, &i| {
            b.iter_custom(|iters| {
                let mut total = Duration::from_secs(0);

                let mut slab = intrusive_collections::LinkedList::new(EntryAdapter::new());
                for idx in 0..i {
                    slab.push_back(Box::new(Entry {
                        link: LinkedListLink::new(),
                        value: Cell::new(idx),
                    }));
                }
                let slab = Arc::new(Mutex::new(slab));

                for _ in 0..iters {
                    let bench = MultithreadedBench::<_, 5>::new(Arc::clone(&slab));

                    let elapsed = bench.run(move |start, slab| {
                        start.wait();

                        let guard = slab.lock().unwrap();
                        let _items: Vec<_> = guard.iter().map(|entry| entry.value.get()).collect();
                    });

                    total += elapsed;
                }

                total
            });
        });

        group.bench_with_input(BenchmarkId::new("im", i), i, |b, &i| {
            b.iter_custom(|iters| {
                let mut total = Duration::from_secs(0);

                let mut slab = im::Vector::new();
                for idx in 0..i {
                    slab.push_back(idx);
                }

                let slab = RwLock::new(slab);
                let slab = Arc::new(slab);

                for _ in 0..iters {
                    let bench = MultithreadedBench::<_, 5>::new(Arc::clone(&slab));

                    let elapsed = bench.run(move |start, slab| {
                        start.wait();

                        let guard = slab.read().unwrap();
                        let _items: Vec<_> = guard.iter().copied().collect();
                    });

                    total += elapsed;
                }

                total
            });
        });

        group.bench_with_input(BenchmarkId::new("deer-append-vec", i), i, |b, &i| {
            b.iter_custom(|iters| {
                let mut total = Duration::from_secs(0);

                let slab = AppendOnlyVec::<usize>::new();
                for idx in 0..i {
                    slab.push(idx);
                }
                let slab = Arc::new(slab);

                for _ in 0..iters {
                    let bench = MultithreadedBench::<_, 5>::new(Arc::clone(&slab));

                    let elapsed = bench.run(move |start, slab| {
                        start.wait();

                        let _items: Vec<_> = slab.iter().copied().collect();
                    });

                    total += elapsed;
                }

                total
            });
        });
    }
}

fn iter_single_thread(c: &mut Criterion) {
    let mut group = c.benchmark_group("iter_single_thread");

    for i in N_INSERTIONS {
        group.bench_with_input(BenchmarkId::new("appendlist", i), i, |b, &i| {
            b.iter_with_setup(
                || {
                    let slab = appendlist::AppendList::<usize>::new();

                    for idx in 0..i {
                        slab.push(idx);
                    }

                    slab
                },
                |slab| {
                    let _items: Vec<_> = slab.iter().copied().collect();
                },
            );
        });

        group.bench_with_input(BenchmarkId::new("intrusive-collections", i), i, |b, &i| {
            b.iter_with_setup(
                || {
                    let mut slab = intrusive_collections::LinkedList::new(EntryAdapter::new());

                    for idx in 0..i {
                        let entry = Box::new(Entry {
                            link: LinkedListLink::new(),
                            value: Cell::new(idx),
                        });

                        slab.push_back(entry)
                    }

                    slab
                },
                |slab| {
                    let _items: Vec<_> = slab.iter().map(|entry| entry.value.get()).collect();
                },
            );
        });

        group.bench_with_input(BenchmarkId::new("im", i), i, |b, &i| {
            b.iter_with_setup(
                || {
                    let mut slab = im::Vector::<usize>::default();

                    for idx in 0..i {
                        slab.push_back(idx);
                    }

                    slab
                },
                |slab| {
                    let _items: Vec<_> = slab.iter().copied().collect();
                },
            );
        });

        group.bench_with_input(BenchmarkId::new("deer-append-vec", i), i, |b, &i| {
            b.iter_with_setup(
                || {
                    let slab = AppendOnlyVec::<usize>::default();

                    for idx in 0..i {
                        slab.push(idx);
                    }

                    slab
                },
                |slab| {
                    let _items: Vec<_> = slab.iter().copied().collect();
                },
            );
        });
    }
}

criterion_group!(push, push_single_thread, push_multi_thread);
criterion_group!(iter, iter_single_thread, iter_multi_thread);
criterion_main!(push, iter);
