use error_stack::{Context, Report, Result};

// inspired by the implementation in `std`, see: https://doc.rust-lang.org/1.81.0/src/core/iter/adapters/mod.rs.html#157
// except with the removal of the Try trait, as it is unstable.
struct ReportShunt<'a, I, T, C> {
    iter: I,
    residual: &'a mut Option<Report<[C]>>,
    _marker: core::marker::PhantomData<fn() -> *const T>,
}

impl<I, T, R, C> Iterator for ReportShunt<'_, I, T, C>
where
    I: Iterator<Item = core::result::Result<T, R>>,
    R: Into<Report<[C]>>,
{
    type Item = T;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            let item = self.iter.next()?;
            let item = item.map_err(Into::into);

            match (item, self.residual.as_mut()) {
                (Ok(output), None) => return Some(output),
                (Ok(_), Some(_)) => {
                    // we're now just consuming the iterator to return all related errors
                    // so we can just ignore the output
                    continue;
                }
                (Err(residual), None) => {
                    *self.residual = Some(residual);
                }
                (Err(residual), Some(report)) => {
                    report.append(residual);
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

fn try_process_reports<I, T, R, C, F, U>(iter: I, mut collect: F) -> Result<U, [C]>
where
    I: Iterator<Item = core::result::Result<T, R>>,
    R: Into<Report<[C]>>,
    for<'a> F: FnMut(ReportShunt<'a, I, T, C>) -> U,
{
    let mut residual = None;
    let shunt = ReportShunt {
        iter,
        residual: &mut residual,
        _marker: core::marker::PhantomData,
    };

    let value = collect(shunt);
    residual.map_or_else(|| Ok(value), |residual| Err(residual))
}

pub trait IteratorExt<C> {
    type Output;

    fn try_collect<A>(self) -> Result<A, [C]>
    where
        A: FromIterator<Self::Output>;
}

impl<T, C, R, I> IteratorExt<C> for I
where
    I: Iterator<Item = core::result::Result<T, R>>,
    R: Into<Report<[C]>>,
    C: Context,
{
    type Output = T;

    fn try_collect<A>(self) -> Result<A, [C]>
    where
        A: FromIterator<Self::Output>,
    {
        try_process_reports(self, |shunt| shunt.collect())
    }
}
