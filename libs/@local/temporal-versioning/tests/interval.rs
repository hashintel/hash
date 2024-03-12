#![feature(lint_reasons)]

use core::ops::Bound;

use temporal_versioning::*;

fn assert_equality(
    actual: impl IntoIterator<Item = Interval<u32, Bound<u32>, Bound<u32>>>,
    expected: impl IntoIterator<Item = Interval<u32, Bound<u32>, Bound<u32>>>,
    operator: &'static str,
) {
    let actual: Vec<_> = actual
        .into_iter()
        .map(|actual| {
            let (start, end) = actual.into_bounds();
            Interval::new(start.into_bound(), end.into_bound())
        })
        .collect();
    let expected: Vec<_> = expected
        .into_iter()
        .map(|expected| {
            let (start, end) = expected.into_bounds();
            Interval::new(start.into_bound(), end.into_bound())
        })
        .collect();

    assert_eq!(
        actual, expected,
        "{operator} output failed, expected {expected:?}, got {actual:?}"
    );
}

struct TestData<I, U, D> {
    lhs: Interval<u32, Bound<u32>, Bound<u32>>,
    rhs: Interval<u32, Bound<u32>, Bound<u32>>,
    intersection: I,
    union: U,
    merge: Interval<u32, Bound<u32>, Bound<u32>>,
    difference: D,
}

fn test(
    test_data: TestData<
        impl IntoIterator<Item = Interval<u32, Bound<u32>, Bound<u32>>>,
        impl IntoIterator<Item = Interval<u32, Bound<u32>, Bound<u32>>>,
        impl IntoIterator<Item = Interval<u32, Bound<u32>, Bound<u32>>>,
    >,
) {
    let TestData {
        lhs,
        rhs,
        intersection,
        union,
        merge,
        difference,
    } = test_data;

    let intersection = intersection.into_iter().collect::<Vec<_>>();
    let union = union.into_iter().collect::<Vec<_>>();
    let difference = difference.into_iter().collect::<Vec<_>>();

    assert_equality(lhs.intersect(rhs), intersection, "intersection");
    assert_equality(lhs.union(rhs), union, "union");
    assert_equality([lhs.merge(rhs)], [merge], "merge");
    assert_equality(lhs.difference(rhs), difference, "difference");

    let calculated_difference = rhs
        .complement()
        .filter_map(|rhs_complement| lhs.intersect(rhs_complement))
        .collect::<Vec<_>>();
    assert_equality(
        calculated_difference,
        lhs.difference(rhs),
        "difference calculated by complement",
    );

    if lhs.merge(rhs) == lhs {
        assert!(
            lhs.contains_interval(&rhs),
            "{lhs:?} contains {rhs:?}, but `contains_interval` reported otherwise"
        );
    } else {
        assert!(
            !lhs.contains_interval(&rhs),
            "{lhs:?} does not contain {rhs:?}, but `contains_interval` reports so"
        );
    }

    if lhs.union(rhs).len() == 1 && lhs.intersect(rhs).is_some() {
        assert!(
            lhs.overlaps(&rhs),
            "{lhs:?} overlaps with {rhs:?}, but `overlaps` does not report so"
        );
    } else {
        assert!(
            !lhs.overlaps(&rhs),
            "{lhs:?} doesn't overlap with {rhs:?}, but `overlaps` does report so"
        );
    }

    if lhs.union(rhs).len() == 1 && !lhs.overlaps(&rhs) {
        assert!(
            lhs.is_adjacent_to(&rhs),
            "{lhs:?} is adjacent to {rhs:?}, but `is_adjacent_to` does not report so"
        );
    } else {
        assert!(
            !lhs.is_adjacent_to(&rhs),
            "{lhs:?} is not adjacent to {rhs:?}, but `is_adjacent_to` does report so"
        );
    }
    // TODO: Not implemented yet
    // assert_equality(lhs.symmetric_difference(rhs),
    // lhs.difference(rhs).union(rhs.difference(lhs)), "symmetric difference");
}

fn unbounded_unbounded() -> Interval<u32, Bound<u32>, Bound<u32>> {
    Interval::new(Bound::Unbounded, Bound::Unbounded)
}

fn included_unbounded(start: u32) -> Interval<u32, Bound<u32>, Bound<u32>> {
    Interval::new(Bound::Included(start), Bound::Unbounded)
}

fn excluded_unbounded(start: u32) -> Interval<u32, Bound<u32>, Bound<u32>> {
    Interval::new(Bound::Excluded(start), Bound::Unbounded)
}

fn unbounded_included(end: u32) -> Interval<u32, Bound<u32>, Bound<u32>> {
    Interval::new(Bound::Unbounded, Bound::Included(end))
}

fn unbounded_excluded(end: u32) -> Interval<u32, Bound<u32>, Bound<u32>> {
    Interval::new(Bound::Unbounded, Bound::Excluded(end))
}

fn included_included(start: u32, end: u32) -> Interval<u32, Bound<u32>, Bound<u32>> {
    Interval::new(Bound::Included(start), Bound::Included(end))
}

fn included_excluded(start: u32, end: u32) -> Interval<u32, Bound<u32>, Bound<u32>> {
    Interval::new(Bound::Included(start), Bound::Excluded(end))
}

fn excluded_included(start: u32, end: u32) -> Interval<u32, Bound<u32>, Bound<u32>> {
    Interval::new(Bound::Excluded(start), Bound::Included(end))
}

fn excluded_excluded(start: u32, end: u32) -> Interval<u32, Bound<u32>, Bound<u32>> {
    Interval::new(Bound::Excluded(start), Bound::Excluded(end))
}

#[test]
#[expect(clippy::too_many_lines)]
fn partially_overlapping() {
    // Range A:      [-----]   |   [-----]
    // Range B:        [-----] | [-----]
    // intersection:   [---]   |   [---]
    // union:        [-------] | [-------]
    // merge:        [-------] | [-------]
    // difference:   [-)       |       (-]
    test(TestData {
        lhs: included_included(0, 10),
        rhs: included_included(5, 15),
        intersection: [included_included(5, 10)],
        union: [included_included(0, 15)],
        merge: included_included(0, 15),
        difference: [included_excluded(0, 5)],
    });
    test(TestData {
        lhs: included_included(5, 15),
        rhs: included_included(0, 10),
        intersection: [included_included(5, 10)],
        union: [included_included(0, 15)],
        merge: included_included(0, 15),
        difference: [excluded_included(10, 15)],
    });

    // Range A:      [-----)   |   [-----]
    // Range B:        [-----] | [-----)
    // intersection:   [---)   |   [---)
    // union:        [-------] | [-------]
    // merge:        [-------] | [-------]
    // difference:   [-)       |       [-]
    test(TestData {
        lhs: included_excluded(0, 10),
        rhs: included_included(5, 15),
        intersection: [included_excluded(5, 10)],
        union: [included_included(0, 15)],
        merge: included_included(0, 15),
        difference: [included_excluded(0, 5)],
    });
    test(TestData {
        lhs: included_included(5, 15),
        rhs: included_excluded(0, 10),
        intersection: [included_excluded(5, 10)],
        union: [included_included(0, 15)],
        merge: included_included(0, 15),
        difference: [included_included(10, 15)],
    });

    // Range A:      [-----]   |   [-----)
    // Range B:        [-----) | [-----]
    // intersection:   [---]   |   [---]
    // union:        [-------) | [-------)
    // merge:        [-------) | [-------)
    // difference:   [-)       |       (-)
    test(TestData {
        lhs: included_included(0, 10),
        rhs: included_excluded(5, 15),
        intersection: [included_included(5, 10)],
        union: [included_excluded(0, 15)],
        merge: included_excluded(0, 15),
        difference: [included_excluded(0, 5)],
    });
    test(TestData {
        lhs: included_excluded(5, 15),
        rhs: included_included(0, 10),
        intersection: [included_included(5, 10)],
        union: [included_excluded(0, 15)],
        merge: included_excluded(0, 15),
        difference: [excluded_excluded(10, 15)],
    });

    // Range A:      [-----)   |   [-----)
    // Range B:        [-----) | [-----)
    // intersection:   [---)   |   [---)
    // union:        [-------) | [-------)
    // merge:        [-------) | [-------)
    // difference:   [-)       |       [-)
    test(TestData {
        lhs: included_excluded(0, 10),
        rhs: included_excluded(5, 15),
        intersection: [included_excluded(5, 10)],
        union: [included_excluded(0, 15)],
        merge: included_excluded(0, 15),
        difference: [included_excluded(0, 5)],
    });
    test(TestData {
        lhs: included_excluded(5, 15),
        rhs: included_excluded(0, 10),
        intersection: [included_excluded(5, 10)],
        union: [included_excluded(0, 15)],
        merge: included_excluded(0, 15),
        difference: [included_excluded(10, 15)],
    });

    // Range A:      (-----]   |   [-----]
    // Range B:        [-----] | (-----]
    // intersection:   [---]   |   [---]
    // union:        (-------] | (-------]
    // merge:        (-------] | (-------]
    // difference:   (-)       |       (-]
    test(TestData {
        lhs: excluded_included(0, 10),
        rhs: included_included(5, 15),
        intersection: [included_included(5, 10)],
        union: [excluded_included(0, 15)],
        merge: excluded_included(0, 15),
        difference: [excluded_excluded(0, 5)],
    });
    test(TestData {
        lhs: included_included(5, 15),
        rhs: excluded_included(0, 10),
        intersection: [included_included(5, 10)],
        union: [excluded_included(0, 15)],
        merge: excluded_included(0, 15),
        difference: [excluded_included(10, 15)],
    });

    // Range A:      (-----)   |   [-----]
    // Range B:        [-----] | (-----)
    // intersection:   [---)   |   [---)
    // union:        (-------] | (-------]
    // merge:        (-------] | (-------]
    // difference:   (-)       |       [-]
    test(TestData {
        lhs: excluded_excluded(0, 10),
        rhs: included_included(5, 15),
        intersection: [included_excluded(5, 10)],
        union: [excluded_included(0, 15)],
        merge: excluded_included(0, 15),
        difference: [excluded_excluded(0, 5)],
    });
    test(TestData {
        lhs: included_included(5, 15),
        rhs: excluded_excluded(0, 10),
        intersection: [included_excluded(5, 10)],
        union: [excluded_included(0, 15)],
        merge: excluded_included(0, 15),
        difference: [included_included(10, 15)],
    });

    // Range A:      (-----]   |   [-----)
    // Range B:        [-----) | (-----]
    // intersection:   [---]   |   [---]
    // union:        (-------) | (-------)
    // merge:        (-------) | (-------)
    // difference:   (-)       |       (-)
    test(TestData {
        lhs: excluded_included(0, 10),
        rhs: included_excluded(5, 15),
        intersection: [included_included(5, 10)],
        union: [excluded_excluded(0, 15)],
        merge: excluded_excluded(0, 15),
        difference: [excluded_excluded(0, 5)],
    });
    test(TestData {
        lhs: included_excluded(5, 15),
        rhs: excluded_included(0, 10),
        intersection: [included_included(5, 10)],
        union: [excluded_excluded(0, 15)],
        merge: excluded_excluded(0, 15),
        difference: [excluded_excluded(10, 15)],
    });

    // Range A:      (-----)   |   [-----)
    // Range B:        [-----) | (-----)
    // intersection:   [---)   |   [---)
    // union:        (-------) | (-------)
    // merge:        (-------) | (-------)
    // difference:   (-)       |       [-)
    test(TestData {
        lhs: excluded_excluded(0, 10),
        rhs: included_excluded(5, 15),
        intersection: [included_excluded(5, 10)],
        union: [excluded_excluded(0, 15)],
        merge: excluded_excluded(0, 15),
        difference: [excluded_excluded(0, 5)],
    });
    test(TestData {
        lhs: included_excluded(5, 15),
        rhs: excluded_excluded(0, 10),
        intersection: [included_excluded(5, 10)],
        union: [excluded_excluded(0, 15)],
        merge: excluded_excluded(0, 15),
        difference: [included_excluded(10, 15)],
    });

    // Range A:      [-----]   |   (-----]
    // Range B:        (-----] | [-----]
    // intersection:   (---]   |   (---]
    // union:        [-------] | [-------]
    // merge:        [-------] | [-------]
    // difference:   [-]       |       (-]
    test(TestData {
        lhs: included_included(0, 10),
        rhs: excluded_included(5, 15),
        intersection: [excluded_included(5, 10)],
        union: [included_included(0, 15)],
        merge: included_included(0, 15),
        difference: [included_included(0, 5)],
    });
    test(TestData {
        lhs: excluded_included(5, 15),
        rhs: included_included(0, 10),
        intersection: [excluded_included(5, 10)],
        union: [included_included(0, 15)],
        merge: included_included(0, 15),
        difference: [excluded_included(10, 15)],
    });

    // Range A:      [-----)   |   (-----]
    // Range B:        (-----] | [-----)
    // intersection:   (---)   |   [---)
    // union:        [-------] | [-------]
    // merge:        [-------] | [-------]
    // difference:   [-]       |       [-]
    test(TestData {
        lhs: included_excluded(0, 10),
        rhs: excluded_included(5, 15),
        intersection: [excluded_excluded(5, 10)],
        union: [included_included(0, 15)],
        merge: included_included(0, 15),
        difference: [included_included(0, 5)],
    });
    test(TestData {
        lhs: excluded_included(5, 15),
        rhs: included_excluded(0, 10),
        intersection: [excluded_excluded(5, 10)],
        union: [included_included(0, 15)],
        merge: included_included(0, 15),
        difference: [included_included(10, 15)],
    });

    // Range A:      [-----]   |   (-----)
    // Range B:        (-----) | [-----]
    // intersection:   (---]   |   (---]
    // union:        [-------) | [-------)
    // merge:        [-------) | [-------)
    // difference:   [-]       |       (-)
    test(TestData {
        lhs: included_included(0, 10),
        rhs: excluded_excluded(5, 15),
        intersection: [excluded_included(5, 10)],
        union: [included_excluded(0, 15)],
        merge: included_excluded(0, 15),
        difference: [included_included(0, 5)],
    });
    test(TestData {
        lhs: excluded_excluded(5, 15),
        rhs: included_included(0, 10),
        intersection: [excluded_included(5, 10)],
        union: [included_excluded(0, 15)],
        merge: included_excluded(0, 15),
        difference: [excluded_excluded(10, 15)],
    });

    // Range A:      [-----)   |   (-----)
    // Range B:        (-----) | [-----)
    // intersection:   (---)   |   [---)
    // union:        [-------) | [-------)
    // merge:        [-------) | [-------)
    // difference:   [-]       |       [-)
    test(TestData {
        lhs: included_excluded(0, 10),
        rhs: excluded_excluded(5, 15),
        intersection: [excluded_excluded(5, 10)],
        union: [included_excluded(0, 15)],
        merge: included_excluded(0, 15),
        difference: [included_included(0, 5)],
    });
    test(TestData {
        lhs: excluded_excluded(5, 15),
        rhs: included_excluded(0, 10),
        intersection: [excluded_excluded(5, 10)],
        union: [included_excluded(0, 15)],
        merge: included_excluded(0, 15),
        difference: [included_excluded(10, 15)],
    });

    // Range A:      (-----]   |   (-----]
    // Range B:        (-----] | (-----]
    // intersection:   (---]   |   [---]
    // union:        (-------] | (-------]
    // merge:        (-------] | (-------]
    // difference:   (-]       |       (-]
    test(TestData {
        lhs: excluded_included(0, 10),
        rhs: excluded_included(5, 15),
        intersection: [excluded_included(5, 10)],
        union: [excluded_included(0, 15)],
        merge: excluded_included(0, 15),
        difference: [excluded_included(0, 5)],
    });
    test(TestData {
        lhs: excluded_included(5, 15),
        rhs: excluded_included(0, 10),
        intersection: [excluded_included(5, 10)],
        union: [excluded_included(0, 15)],
        merge: excluded_included(0, 15),
        difference: [excluded_included(10, 15)],
    });

    // Range A:      (-----)   |   (-----]
    // Range B:        (-----] | (-----)
    // intersection:   (---)   |   (---)
    // union:        (-------] | (-------]
    // merge:        (-------] | (-------]
    // difference:   (-]       |       [-]
    test(TestData {
        lhs: excluded_excluded(0, 10),
        rhs: excluded_included(5, 15),
        intersection: [excluded_excluded(5, 10)],
        union: [excluded_included(0, 15)],
        merge: excluded_included(0, 15),
        difference: [excluded_included(0, 5)],
    });
    test(TestData {
        lhs: excluded_included(5, 15),
        rhs: excluded_excluded(0, 10),
        intersection: [excluded_excluded(5, 10)],
        union: [excluded_included(0, 15)],
        merge: excluded_included(0, 15),
        difference: [included_included(10, 15)],
    });

    // Range A:      (-----]   |   (-----)
    // Range B:        (-----) | (-----]
    // intersection:   (---]   |   (---]
    // union:        (-------) | (-------)
    // merge:        (-------) | (-------)
    // difference:   (-]       |       (-)
    test(TestData {
        lhs: excluded_included(0, 10),
        rhs: excluded_excluded(5, 15),
        intersection: [excluded_included(5, 10)],
        union: [excluded_excluded(0, 15)],
        merge: excluded_excluded(0, 15),
        difference: [excluded_included(0, 5)],
    });
    test(TestData {
        lhs: excluded_excluded(5, 15),
        rhs: excluded_included(0, 10),
        intersection: [excluded_included(5, 10)],
        union: [excluded_excluded(0, 15)],
        merge: excluded_excluded(0, 15),
        difference: [excluded_excluded(10, 15)],
    });

    // Range A:      (-----)   |   (-----)
    // Range B:        (-----) | (-----)
    // intersection:   (---)   |   (---)
    // union:        (-------) | (-------)
    // merge:        (-------) | (-------)
    // difference:   (-]       |       [-)
    test(TestData {
        lhs: excluded_excluded(0, 10),
        rhs: excluded_excluded(5, 15),
        intersection: [excluded_excluded(5, 10)],
        union: [excluded_excluded(0, 15)],
        merge: excluded_excluded(0, 15),
        difference: [excluded_included(0, 5)],
    });
    test(TestData {
        lhs: excluded_excluded(5, 15),
        rhs: excluded_excluded(0, 10),
        intersection: [excluded_excluded(5, 10)],
        union: [excluded_excluded(0, 15)],
        merge: excluded_excluded(0, 15),
        difference: [included_excluded(10, 15)],
    });

    // Range A:      ------]   |   [------
    // Range B:        [------ | ------]
    // intersection:   [---]   |   [---]
    // union:        --------- | ---------
    // merge:        --------- | ---------
    // difference:   --)       |       (--
    test(TestData {
        lhs: unbounded_included(10),
        rhs: included_unbounded(5),
        intersection: [included_included(5, 10)],
        union: [unbounded_unbounded()],
        merge: unbounded_unbounded(),
        difference: [unbounded_excluded(5)],
    });
    test(TestData {
        lhs: included_unbounded(5),
        rhs: unbounded_included(10),
        intersection: [included_included(5, 10)],
        union: [unbounded_unbounded()],
        merge: unbounded_unbounded(),
        difference: [excluded_unbounded(10)],
    });

    // Range A:      ------)   |   (------
    // Range B:        (------ | ------)
    // intersection:   (---)   |   (---)
    // union:        --------- | ---------
    // merge:        --------- | ---------
    // difference:   --]       |       [--
    test(TestData {
        lhs: unbounded_excluded(10),
        rhs: excluded_unbounded(5),
        intersection: [excluded_excluded(5, 10)],
        union: [unbounded_unbounded()],
        merge: unbounded_unbounded(),
        difference: [unbounded_included(5)],
    });
    test(TestData {
        lhs: excluded_unbounded(5),
        rhs: unbounded_excluded(10),
        intersection: [excluded_excluded(5, 10)],
        union: [unbounded_unbounded()],
        merge: unbounded_unbounded(),
        difference: [included_unbounded(10)],
    });
}

#[test]
#[expect(clippy::too_many_lines)]
fn disjoint() {
    // Range A:      [---]       |       [---]
    // Range B:            [---] | [---]
    // intersection:    empty    |    empty
    // union:        [---] [---] | [---] [---]
    // merge:        [---------] | [---------]
    // difference:   [---]       |       [---]
    test(TestData {
        lhs: included_included(0, 5),
        rhs: included_included(10, 15),
        intersection: [],
        union: [included_included(0, 5), included_included(10, 15)],
        merge: included_included(0, 15),
        difference: [included_included(0, 5)],
    });
    test(TestData {
        lhs: included_included(10, 15),
        rhs: included_included(0, 5),
        intersection: [],
        union: [included_included(10, 15), included_included(0, 5)],
        merge: included_included(0, 15),
        difference: [included_included(10, 15)],
    });

    // Range A:      [---)       |       [---]
    // Range B:            [---] | [---)
    // intersection:    empty    |    empty
    // union:        [---) [---] | [---) [---]
    // merge:        [---------] | [---------]
    // difference:   [---)       |       [---]
    test(TestData {
        lhs: included_excluded(0, 5),
        rhs: included_included(10, 15),
        intersection: [],
        union: [included_excluded(0, 5), included_included(10, 15)],
        merge: included_included(0, 15),
        difference: [included_excluded(0, 5)],
    });
    test(TestData {
        lhs: included_included(10, 15),
        rhs: included_excluded(0, 5),
        intersection: [],
        union: [included_included(10, 15), included_excluded(0, 5)],
        merge: included_included(0, 15),
        difference: [included_included(10, 15)],
    });

    // Range A:      [---]       |       [---)
    // Range B:            [---) | [---]
    // intersection:    empty    |    empty
    // union:        [---] [---) | [---] [---)
    // merge:        [---------) | [---------)
    // difference:   [---]       |       [---)
    test(TestData {
        lhs: included_included(0, 5),
        rhs: included_excluded(10, 15),
        intersection: [],
        union: [included_included(0, 5), included_excluded(10, 15)],
        merge: included_excluded(0, 15),
        difference: [included_included(0, 5)],
    });
    test(TestData {
        lhs: included_excluded(10, 15),
        rhs: included_included(0, 5),
        intersection: [],
        union: [included_excluded(10, 15), included_included(0, 5)],
        merge: included_excluded(0, 15),
        difference: [included_excluded(10, 15)],
    });

    // Range A:      [---)       |       [---)
    // Range B:            [---) | [---)
    // intersection:    empty    |    empty
    // union:        [---) [---) | [---) [---)
    // merge:        [---------) | [---------)
    // difference:   [---)       |       [---)
    test(TestData {
        lhs: included_excluded(0, 5),
        rhs: included_excluded(10, 15),
        intersection: [],
        union: [included_excluded(0, 5), included_excluded(10, 15)],
        merge: included_excluded(0, 15),
        difference: [included_excluded(0, 5)],
    });
    test(TestData {
        lhs: included_excluded(10, 15),
        rhs: included_excluded(0, 5),
        intersection: [],
        union: [included_excluded(10, 15), included_excluded(0, 5)],
        merge: included_excluded(0, 15),
        difference: [included_excluded(10, 15)],
    });

    // Range A:      (---]       |       [---]
    // Range B:            [---] | (---]
    // intersection:    empty    |    empty
    // union:        (---] [---] | (---] [---]
    // merge:        (---------] | (---------]
    // difference:   (---]       |       [---]
    test(TestData {
        lhs: excluded_included(0, 5),
        rhs: included_included(10, 15),
        intersection: [],
        union: [excluded_included(0, 5), included_included(10, 15)],
        merge: excluded_included(0, 15),
        difference: [excluded_included(0, 5)],
    });
    test(TestData {
        lhs: included_included(10, 15),
        rhs: excluded_included(0, 5),
        intersection: [],
        union: [included_included(10, 15), excluded_included(0, 5)],
        merge: excluded_included(0, 15),
        difference: [included_included(10, 15)],
    });

    // Range A:      (---)       |       [---]
    // Range B:            [---] | (---)
    // intersection:    empty    |    empty
    // union:        (---) [---] | (---) [---]
    // merge:        (---------] | (---------]
    // difference:   (---)       |       [---]
    test(TestData {
        lhs: excluded_excluded(0, 5),
        rhs: included_included(10, 15),
        intersection: [],
        union: [excluded_excluded(0, 5), included_included(10, 15)],
        merge: excluded_included(0, 15),
        difference: [excluded_excluded(0, 5)],
    });
    test(TestData {
        lhs: included_included(10, 15),
        rhs: excluded_excluded(0, 5),
        intersection: [],
        union: [included_included(10, 15), excluded_excluded(0, 5)],
        merge: excluded_included(0, 15),
        difference: [included_included(10, 15)],
    });

    // Range A:      (---]       |       [---)
    // Range B:            [---) | (---]
    // intersection:    empty    |    empty
    // union:        (---] [---) | (---] [---)
    // merge:        (---------) | (---------)
    // difference:   (---]       |       [---)
    test(TestData {
        lhs: excluded_included(0, 5),
        rhs: included_excluded(10, 15),
        intersection: [],
        union: [excluded_included(0, 5), included_excluded(10, 15)],
        merge: excluded_excluded(0, 15),
        difference: [excluded_included(0, 5)],
    });
    test(TestData {
        lhs: included_excluded(10, 15),
        rhs: excluded_included(0, 5),
        intersection: [],
        union: [included_excluded(10, 15), excluded_included(0, 5)],
        merge: excluded_excluded(0, 15),
        difference: [included_excluded(10, 15)],
    });

    // Range A:      (---)       |       [---)
    // Range B:            [---) | (---)
    // intersection:    empty    |    empty
    // union:        (---) [---) | (---) [---)
    // merge:        (---------) | (---------)
    // difference:   (---)       |       [---)
    test(TestData {
        lhs: excluded_excluded(0, 5),
        rhs: included_excluded(10, 15),
        intersection: [],
        union: [excluded_excluded(0, 5), included_excluded(10, 15)],
        merge: excluded_excluded(0, 15),
        difference: [excluded_excluded(0, 5)],
    });
    test(TestData {
        lhs: included_excluded(10, 15),
        rhs: excluded_excluded(0, 5),
        intersection: [],
        union: [included_excluded(10, 15), excluded_excluded(0, 5)],
        merge: excluded_excluded(0, 15),
        difference: [included_excluded(10, 15)],
    });

    // Range A:      [---]       |       (---]
    // Range B:            (---] | [---]
    // intersection:    empty    |    empty
    // union:        [---] (---] | [---] (---]
    // merge:        [---------] | [---------]
    // difference:   [---]       |       (---]
    test(TestData {
        lhs: included_included(0, 5),
        rhs: excluded_included(10, 15),
        intersection: [],
        union: [included_included(0, 5), excluded_included(10, 15)],
        merge: included_included(0, 15),
        difference: [included_included(0, 5)],
    });
    test(TestData {
        lhs: excluded_included(10, 15),
        rhs: included_included(0, 5),
        intersection: [],
        union: [excluded_included(10, 15), included_included(0, 5)],
        merge: included_included(0, 15),
        difference: [excluded_included(10, 15)],
    });

    // Range A:      [---)       |       (---]
    // Range B:            (---] | [---)
    // intersection:    empty    |    empty
    // union:        [---) (---] | [---) (---]
    // merge:        [---------] | [---------]
    // difference:   [---)       |       (---]
    test(TestData {
        lhs: included_excluded(0, 5),
        rhs: excluded_included(10, 15),
        intersection: [],
        union: [included_excluded(0, 5), excluded_included(10, 15)],
        merge: included_included(0, 15),
        difference: [included_excluded(0, 5)],
    });
    test(TestData {
        lhs: excluded_included(10, 15),
        rhs: included_excluded(0, 5),
        intersection: [],
        union: [excluded_included(10, 15), included_excluded(0, 5)],
        merge: included_included(0, 15),
        difference: [excluded_included(10, 15)],
    });

    // Range A:      [---]       |       (---)
    // Range B:            (---) | [---]
    // intersection:    empty    |    empty
    // union:        [---] (---) | [---] (---)
    // merge:        [---------) | [---------)
    // difference:   [---]       |       (---)
    test(TestData {
        lhs: included_included(0, 5),
        rhs: excluded_excluded(10, 15),
        intersection: [],
        union: [included_included(0, 5), excluded_excluded(10, 15)],
        merge: included_excluded(0, 15),
        difference: [included_included(0, 5)],
    });
    test(TestData {
        lhs: excluded_excluded(10, 15),
        rhs: included_included(0, 5),
        intersection: [],
        union: [excluded_excluded(10, 15), included_included(0, 5)],
        merge: included_excluded(0, 15),
        difference: [excluded_excluded(10, 15)],
    });

    // Range A:      [---)       |       (---)
    // Range B:            (---) | [---)
    // intersection:    empty    |    empty
    // union:        [---) (---) | [---) (---)
    // merge:        [---------) | [---------)
    // difference:   [---)       |       (---)
    test(TestData {
        lhs: included_excluded(0, 5),
        rhs: excluded_excluded(10, 15),
        intersection: [],
        union: [included_excluded(0, 5), excluded_excluded(10, 15)],
        merge: included_excluded(0, 15),
        difference: [included_excluded(0, 5)],
    });
    test(TestData {
        lhs: excluded_excluded(10, 15),
        rhs: included_excluded(0, 5),
        intersection: [],
        union: [excluded_excluded(10, 15), included_excluded(0, 5)],
        merge: included_excluded(0, 15),
        difference: [excluded_excluded(10, 15)],
    });

    // Range A:      (---]       |       (---]
    // Range B:            (---] | (---]
    // intersection:    empty    |    empty
    // union:        (---] (---] | (---] (---]
    // merge:        (---------] | (---------]
    // difference:   (---]       |       (---]
    test(TestData {
        lhs: excluded_included(0, 5),
        rhs: excluded_included(10, 15),
        intersection: [],
        union: [excluded_included(0, 5), excluded_included(10, 15)],
        merge: excluded_included(0, 15),
        difference: [excluded_included(0, 5)],
    });
    test(TestData {
        lhs: excluded_included(10, 15),
        rhs: excluded_included(0, 5),
        intersection: [],
        union: [excluded_included(10, 15), excluded_included(0, 5)],
        merge: excluded_included(0, 15),
        difference: [excluded_included(10, 15)],
    });

    // Range A:      (---)       |       (---]
    // Range B:            (---] | (---)
    // intersection:    empty    |    empty
    // union:        (---) (---] | (---) (---]
    // merge:        (---------] | (---------]
    // difference:   (---)       |       (---]
    test(TestData {
        lhs: excluded_excluded(0, 5),
        rhs: excluded_included(10, 15),
        intersection: [],
        union: [excluded_excluded(0, 5), excluded_included(10, 15)],
        merge: excluded_included(0, 15),
        difference: [excluded_excluded(0, 5)],
    });
    test(TestData {
        lhs: excluded_included(10, 15),
        rhs: excluded_excluded(0, 5),
        intersection: [],
        union: [excluded_included(10, 15), excluded_excluded(0, 5)],
        merge: excluded_included(0, 15),
        difference: [excluded_included(10, 15)],
    });

    // Range A:      (---]       |       (---)
    // Range B:            (---) | (---]
    // intersection:    empty    |    empty
    // union:        (---] (---) | (---] (---)
    // merge:        (---------) | (---------)
    // difference:   (---]       |       (---)
    test(TestData {
        lhs: excluded_included(0, 5),
        rhs: excluded_excluded(10, 15),
        intersection: [],
        union: [excluded_included(0, 5), excluded_excluded(10, 15)],
        merge: excluded_excluded(0, 15),
        difference: [excluded_included(0, 5)],
    });
    test(TestData {
        lhs: excluded_excluded(10, 15),
        rhs: excluded_included(0, 5),
        intersection: [],
        union: [excluded_excluded(10, 15), excluded_included(0, 5)],
        merge: excluded_excluded(0, 15),
        difference: [excluded_excluded(10, 15)],
    });

    // Range A:      (---)       |       (---)
    // Range B:            (---) | (---)
    // intersection:    empty    |    empty
    // union:        (---) (---) | (---) (---)
    // merge:        (---------) | (---------)
    // difference:   (---)       |       (---)
    test(TestData {
        lhs: excluded_excluded(0, 5),
        rhs: excluded_excluded(5, 15),
        intersection: [],
        union: [excluded_excluded(0, 5), excluded_excluded(5, 15)],
        merge: excluded_excluded(0, 15),
        difference: [excluded_excluded(0, 5)],
    });
    test(TestData {
        lhs: excluded_excluded(5, 15),
        rhs: excluded_excluded(0, 5),
        intersection: [],
        union: [excluded_excluded(5, 15), excluded_excluded(0, 5)],
        merge: excluded_excluded(0, 15),
        difference: [excluded_excluded(5, 15)],
    });
}

#[test]
fn adjacent() {
    // Range A:      [---]     |     [---]
    // Range B:          [---] | [---]
    // intersection:     |     |     |
    // union:        [-------] | [-------]
    // merge:        [-------] | [-------]
    // difference:   [---)     |     (---]
    test(TestData {
        lhs: included_included(0, 5),
        rhs: included_included(5, 10),
        intersection: [included_included(5, 5)],
        union: [included_included(0, 10)],
        merge: included_included(0, 10),
        difference: [included_excluded(0, 5)],
    });
    test(TestData {
        lhs: included_included(5, 10),
        rhs: included_included(0, 5),
        intersection: [included_included(5, 5)],
        union: [included_included(0, 10)],
        merge: included_included(0, 10),
        difference: [excluded_included(5, 10)],
    });

    // Range A:      [---]     |     (---]
    // Range B:          (---] | [---]
    // intersection:   empty   |   empty
    // union:        [-------] | [-------]
    // merge:        [-------] | [-------]
    // difference:   [---]     |     (---]
    test(TestData {
        lhs: included_included(0, 5),
        rhs: excluded_included(5, 10),
        intersection: [],
        union: [included_included(0, 10)],
        merge: included_included(0, 10),
        difference: [included_included(0, 5)],
    });
    test(TestData {
        lhs: excluded_included(5, 10),
        rhs: included_included(0, 5),
        intersection: [],
        union: [included_included(0, 10)],
        merge: included_included(0, 10),
        difference: [excluded_included(5, 10)],
    });

    // Range A:      [---)     |     [---]
    // Range B:          [---] | [---)
    // intersection:   empty   |   empty
    // union:        [-------] | [-------]
    // merge:        [-------] | [-------]
    // difference:   [---)     |     [---]
    test(TestData {
        lhs: included_excluded(0, 5),
        rhs: included_included(5, 10),
        intersection: [],
        union: [included_included(0, 10)],
        merge: included_included(0, 10),
        difference: [included_excluded(0, 5)],
    });
    test(TestData {
        lhs: included_included(5, 10),
        rhs: included_excluded(0, 5),
        intersection: [],
        union: [included_included(0, 10)],
        merge: included_included(0, 10),
        difference: [included_included(5, 10)],
    });

    // Range A:      [---)     |     (---]
    // Range B:          (---] | [---)
    // intersection:   empty   |   empty
    // union:        [---X---] | [---X---]
    // merge:        [-------] | [-------]
    // difference:   [---)     |     (---]
    test(TestData {
        lhs: included_excluded(0, 5),
        rhs: excluded_included(5, 10),
        intersection: [],
        union: [included_excluded(0, 5), excluded_included(5, 10)],
        merge: included_included(0, 10),
        difference: [included_excluded(0, 5)],
    });
    test(TestData {
        lhs: excluded_included(5, 10),
        rhs: included_excluded(0, 5),
        intersection: [],
        union: [excluded_included(5, 10), included_excluded(0, 5)],
        merge: included_included(0, 10),
        difference: [excluded_included(5, 10)],
    });
}

#[test]
fn contained() {
    // Range A:      [-------] |   [---]
    // Range B:        [---]   | [-------]
    // intersection:   [---]   |   [---]
    // union:        [-------] | [-------]
    // merge:        [-------] | [-------]
    // difference:   [-)   (-] |   empty
    test(TestData {
        lhs: included_included(0, 15),
        rhs: included_included(5, 10),
        intersection: [included_included(5, 10)],
        union: [included_included(0, 15)],
        merge: included_included(0, 15),
        difference: [included_excluded(0, 5), excluded_included(10, 15)],
    });
    test(TestData {
        lhs: included_included(5, 10),
        rhs: included_included(0, 15),
        intersection: [included_included(5, 10)],
        union: [included_included(0, 15)],
        merge: included_included(0, 15),
        difference: [],
    });

    // Range A:      [-------] |   (---)
    // Range B:        (---)   | [-------]
    // intersection:   (---)   |   (---)
    // union:        [-------] | [-------]
    // merge:        [-------] | [-------]
    // difference:   [-]   [-] |   empty
    test(TestData {
        lhs: included_included(0, 15),
        rhs: excluded_excluded(5, 10),
        intersection: [excluded_excluded(5, 10)],
        union: [included_included(0, 15)],
        merge: included_included(0, 15),
        difference: [included_included(0, 5), included_included(10, 15)],
    });
    test(TestData {
        lhs: excluded_excluded(5, 10),
        rhs: included_included(0, 15),
        intersection: [excluded_excluded(5, 10)],
        union: [included_included(0, 15)],
        merge: included_included(0, 15),
        difference: [],
    });

    // Range A:      --------- |   (---)
    // Range B:        (---)   | ---------
    // intersection:   (---)   |   (---)
    // union:        --------- | ---------
    // merge:        --------- | ---------
    // difference:   --]   [-- |   empty
    test(TestData {
        lhs: unbounded_unbounded(),
        rhs: excluded_excluded(5, 10),
        intersection: [excluded_excluded(5, 10)],
        union: [unbounded_unbounded()],
        merge: unbounded_unbounded(),
        difference: [unbounded_included(5), included_unbounded(10)],
    });
    test(TestData {
        lhs: excluded_excluded(5, 10),
        rhs: unbounded_unbounded(),
        intersection: [excluded_excluded(5, 10)],
        union: [unbounded_unbounded()],
        merge: unbounded_unbounded(),
        difference: [],
    });

    // Range A:      --------- |   [---]
    // Range B:        [---]   | ---------
    // intersection:   [---]   |   [---]
    // union:        --------- | ---------
    // merge:        --------- | ---------
    // difference:   --)   (-- |   empty
    test(TestData {
        lhs: unbounded_unbounded(),
        rhs: included_included(5, 10),
        intersection: [included_included(5, 10)],
        union: [unbounded_unbounded()],
        merge: unbounded_unbounded(),
        difference: [unbounded_excluded(5), excluded_unbounded(10)],
    });
    test(TestData {
        lhs: included_included(5, 10),
        rhs: unbounded_unbounded(),
        intersection: [included_included(5, 10)],
        union: [unbounded_unbounded()],
        merge: unbounded_unbounded(),
        difference: [],
    });
}

#[test]
fn equal() {
    for interval in [
        included_included(0, 5),
        excluded_included(0, 5),
        included_excluded(0, 5),
        excluded_excluded(0, 5),
        included_unbounded(0),
        unbounded_included(5),
        excluded_unbounded(0),
        unbounded_excluded(5),
        unbounded_unbounded(),
    ] {
        test(TestData {
            lhs: interval,
            rhs: interval,
            intersection: [interval],
            union: [interval],
            merge: interval,
            difference: [],
        });
    }
}

#[test]
#[expect(clippy::cognitive_complexity)]
fn contains_point() {
    assert!(included_included(5, 10).contains_point(&5));
    assert!(included_included(5, 10).contains_point(&10));
    assert!(!included_included(5, 10).contains_point(&4));
    assert!(!included_included(5, 10).contains_point(&11));

    assert!(excluded_included(5, 10).contains_point(&6));
    assert!(excluded_included(5, 10).contains_point(&10));
    assert!(!excluded_included(5, 10).contains_point(&5));
    assert!(!excluded_included(5, 10).contains_point(&11));

    assert!(included_excluded(5, 10).contains_point(&5));
    assert!(included_excluded(5, 10).contains_point(&9));
    assert!(!included_excluded(5, 10).contains_point(&4));
    assert!(!included_excluded(5, 10).contains_point(&10));

    assert!(excluded_excluded(5, 10).contains_point(&6));
    assert!(excluded_excluded(5, 10).contains_point(&9));
    assert!(!excluded_excluded(5, 10).contains_point(&5));
    assert!(!excluded_excluded(5, 10).contains_point(&10));

    assert!(included_unbounded(5).contains_point(&5));
    assert!(included_unbounded(5).contains_point(&10));
    assert!(!included_unbounded(5).contains_point(&4));

    assert!(unbounded_included(10).contains_point(&5));
    assert!(unbounded_included(10).contains_point(&10));
    assert!(!unbounded_included(10).contains_point(&11));

    assert!(excluded_unbounded(5).contains_point(&6));
    assert!(excluded_unbounded(5).contains_point(&10));
    assert!(!excluded_unbounded(5).contains_point(&5));

    assert!(unbounded_excluded(10).contains_point(&5));
    assert!(unbounded_excluded(10).contains_point(&4));
    assert!(!unbounded_excluded(10).contains_point(&10));

    assert!(unbounded_unbounded().contains_point(&5));
}
