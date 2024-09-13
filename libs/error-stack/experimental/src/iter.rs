use core::ops::{ControlFlow, FromResidual, Residual, Try};

use error_stack::Report;

// see: https://doc.rust-lang.org/src/core/ops/try_trait.rs.html#367
type ChangeOutputType<T: Try<Residual: Residual<V>>, V> = <T::Residual as Residual<V>>::TryType;

// inspired by the implementation in `std`, see: https://doc.rust-lang.org/1.81.0/src/core/iter/adapters/mod.rs.html#157
struct ReportShunt<'a, I, C> {
    iter: I,
    residual: &'a mut Option<Report<[C]>>,
}

impl<I, R, C> Iterator for ReportShunt<'_, I, C>
where
    I: Iterator<Item: Try<Residual = R>>,
    R: Into<Report<[C]>>,
{
    type Item = <I::Item as Try>::Output;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            let item = self.iter.next()?;

            match (Try::branch(item), self.residual.as_mut()) {
                (ControlFlow::Continue(output), None) => return Some(output),
                (ControlFlow::Continue(_), Some(_)) => {
                    // we're now just consuming the iterator to return all related errors
                    // so we can just ignore the output
                    continue;
                }
                (ControlFlow::Break(residual), None) => {
                    *self.residual = Some(residual.into());
                }
                (ControlFlow::Break(residual), Some(report)) => {
                    report.append(residual.into());
                }
            }
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        if self.residual.is_some() {
            (0, Some(0))
        } else {
            let (_, upper) = self.iter.size_hint();

            (0, upper)
        }
    }
}

fn try_process_reports<I, T, R, C, F, U>(iter: I, mut f: F) -> ChangeOutputType<I::Item, U>
where
    I: Iterator<Item: Try<Output = T, Residual = R>>,
    R: Into<Report<[C]>> + Residual<U, TryType: FromResidual<Report<[C]>>>,
    for<'a> F: FnMut(ReportShunt<'a, I, C>) -> U,
{
    let mut residual = None;
    let shunt = ReportShunt {
        iter,
        residual: &mut residual,
    };

    let value = f(shunt);
    match residual {
        Some(residual) => FromResidual::from_residual(residual),
        None => Try::from_output(value),
    }
}
