use core::ops::Range;

use hashql_diagnostics::source::{SourceId, SourceSpan};
use text_size::{TextRange, TextSize};

use super::{Span, SpanAncestors, SpanAncestorsMut, SpanId, SpanResolutionMode};

#[derive(Debug)]
struct SpanEntry<S> {
    span: S,
    mode: SpanResolutionMode,
    ancestors: Range<usize>,
}

/// Efficient storage and resolution system for source code spans.
///
/// [`SpanTable`] serves as the central repository for span data within a single source file.
///
/// # Source Affinity
///
/// Each [`SpanTable`] belongs to exactly one [`SourceId`], which prevents cross-contamination
/// between different source files. All spans inserted into the table will be encoded with this
/// source ID.
#[derive(Debug)]
pub struct SpanTable<S> {
    source_id: SourceId,
    spans: Vec<SpanEntry<S>>,
    ancestors: Vec<SpanId>,
}

impl<S> SpanTable<S> {
    /// Creates a new, empty span table for the specified source.
    ///
    /// The `source` parameter determines the [`SourceId`] that will be encoded
    /// into all [`SpanId`] values created by this table.
    ///
    /// # Panics
    ///
    /// Panics if the source ID exceeds the maximum allowed value that can be represented within a
    /// [`SpanId`].
    ///
    /// # Examples
    ///
    /// ```rust
    /// use hashql_core::span::SpanTable;
    /// use hashql_diagnostics::source::SourceId;
    ///
    /// # struct MySpan;
    /// let source_id = SourceId::new_unchecked(42);
    /// let table = SpanTable::<MySpan>::new(source_id);
    ///
    /// // Table is ready for span insertion
    /// ```
    #[must_use]
    pub const fn new(source: SourceId) -> Self {
        assert!(
            source.value() <= SpanId::MAX_SOURCE_ID,
            "source ID exceeds maximum"
        );

        Self {
            source_id: source,
            spans: Vec::new(),
            ancestors: Vec::new(),
        }
    }

    /// Inserts a new span into the table with the specified ancestors.
    ///
    /// Creates a new [`SpanId`] that references the inserted span data and stores the ancestor
    /// relationships for later resolution. The returned [`SpanId`] encodes both the table's
    /// source ID and the insertion index.
    ///
    /// # Panics
    ///
    /// Panics if the there are more spans than which can be represented by the [`SpanId`] type.
    ///
    /// # Examples
    ///
    /// Inserting a root span:
    ///
    /// ```rust
    /// use hashql_core::span::{SpanAncestors, SpanTable, TextRange};
    /// use hashql_diagnostics::source::SourceId;
    ///
    /// # struct MySpan { range: TextRange }
    /// # impl hashql_core::span::Span for MySpan {
    /// #     fn range(&self) -> TextRange { self.range }
    /// # }
    /// let mut table = SpanTable::new(SourceId::new_unchecked(0));
    ///
    /// let span = MySpan {
    ///     range: TextRange::new(0.into(), 10.into()),
    /// };
    /// let span_id = table.insert(span, SpanAncestors::empty());
    ///
    /// // Verify span was inserted successfully
    /// assert_eq!(
    ///     table.get(span_id).map(|span| span.range),
    ///     Some(TextRange::new(0.into(), 10.into()))
    /// );
    /// ```
    ///
    /// Inserting a span with ancestors:
    ///
    /// ```rust
    /// use hashql_core::span::{SpanAncestors, SpanTable, TextRange};
    /// use hashql_diagnostics::source::SourceId;
    ///
    /// # struct MySpan { range: TextRange }
    /// # impl hashql_core::span::Span for MySpan {
    /// #     fn range(&self) -> TextRange { self.range }
    /// # }
    /// let mut table = SpanTable::new(SourceId::new_unchecked(1));
    ///
    /// // Insert parent span
    /// let parent = MySpan {
    ///     range: TextRange::new(10.into(), 50.into()),
    /// };
    /// let parent_id = table.insert(parent, SpanAncestors::empty());
    ///
    /// // Insert child span with parent as ancestor
    /// let child = MySpan {
    ///     range: TextRange::new(5.into(), 15.into()),
    /// };
    /// let child_id = table.insert(child, SpanAncestors::union(&[parent_id]));
    ///
    /// // Verify child span was inserted successfully
    /// assert_eq!(
    ///     table.get(child_id).map(|span| span.range),
    ///     Some(TextRange::new(5.into(), 15.into()))
    /// );
    /// ```
    #[expect(
        clippy::cast_possible_truncation,
        reason = "The arena is not expected to be larger than u32::MAX + debug assertions"
    )]
    pub fn insert(&mut self, span: S, ancestors: SpanAncestors) -> SpanId {
        let ancestors_index = self.ancestors.len();
        self.ancestors.extend_from_slice(ancestors.spans);

        let index = self.spans.len() as u32;
        self.spans.push(SpanEntry {
            span,
            mode: ancestors.mode,
            ancestors: ancestors_index..(ancestors_index + ancestors.spans.len()),
        });

        assert!(index <= SpanId::MAX_ID, "span index overflow");
        SpanId::new(self.source_id, index)
    }

    /// Modifies an existing span and its ancestor relationships.
    ///
    /// Provides mutable access to both the span data and its ancestor configuration.
    ///
    /// # Returns
    ///
    /// - `true` if the span was found and successfully modified
    /// - `false` if the span doesn't exist or belongs to a different source
    ///
    /// # Examples
    ///
    /// Changing resolution mode:
    ///
    /// ```rust
    /// use hashql_core::span::{SpanAncestors, SpanResolutionMode, SpanTable, TextRange};
    /// use hashql_diagnostics::source::SourceId;
    ///
    /// # struct MySpan { name: &'static str, range: TextRange }
    /// # impl hashql_core::span::Span for MySpan {
    /// #     fn range(&self) -> TextRange { self.range }
    /// # }
    /// let mut table = SpanTable::new(SourceId::new_unchecked(3));
    ///
    /// let span = MySpan {
    ///     name: "test",
    ///     range: TextRange::new(10.into(), 20.into()),
    /// };
    /// let span_id = table.insert(span, SpanAncestors::empty());
    ///
    /// let success = table.modify(span_id, |_span, mut ancestors| {
    ///     *ancestors.mode = SpanResolutionMode::Intersection;
    /// });
    ///
    /// assert!(success);
    /// ```
    ///
    /// Updating span content:
    ///
    /// ```rust
    /// use hashql_core::span::{SpanAncestors, SpanTable, TextRange};
    /// use hashql_diagnostics::source::SourceId;
    ///
    /// # struct MySpan { name: &'static str, range: TextRange }
    /// # impl hashql_core::span::Span for MySpan {
    /// #     fn range(&self) -> TextRange { self.range }
    /// # }
    /// let mut table = SpanTable::new(SourceId::new_unchecked(4));
    ///
    /// let span = MySpan {
    ///     name: "old_name",
    ///     range: TextRange::new(5.into(), 15.into()),
    /// };
    /// let span_id = table.insert(span, SpanAncestors::empty());
    ///
    /// let success = table.update(span_id, |span, _ancestors| {
    ///     span.name = "new_name";
    /// });
    ///
    /// assert!(success);
    /// assert_eq!(table.get(span_id).map(|span| span.name), Some("new_name"));
    /// ```
    ///
    /// Handling cross-source modification attempts:
    ///
    /// ```rust
    /// use hashql_core::span::{SpanAncestors, SpanTable, TextRange};
    /// use hashql_diagnostics::source::SourceId;
    ///
    /// # struct MySpan { range: TextRange }
    /// # impl hashql_core::span::Span for MySpan {
    /// #     fn range(&self) -> TextRange { self.range }
    /// # }
    /// let mut table = SpanTable::new(SourceId::new_unchecked(5));
    /// let span = MySpan {
    ///     range: TextRange::new(0.into(), 10.into()),
    /// };
    /// let span_id = table.insert(span, SpanAncestors::empty());
    ///
    /// // Try to update from a different source - should fail
    /// let mut table2 = SpanTable::new(SourceId::new_unchecked(1));
    /// let success = table2.update(span_id, |_span: &mut MySpan, _ancestors| {
    ///     // This won't execute due to source mismatch
    /// });
    ///
    /// assert!(!success); // Modification rejected
    /// ```
    pub fn update(&mut self, span: SpanId, func: impl FnOnce(&mut S, SpanAncestorsMut)) -> bool {
        if span.source_id() != self.source_id {
            return false;
        }

        let index = span.id() as usize;

        let Some(element) = self.spans.get_mut(index) else {
            return false;
        };

        func(
            &mut element.span,
            SpanAncestorsMut {
                spans: &mut self.ancestors[element.ancestors.clone()],
                mode: &mut element.mode,
            },
        );
        true
    }

    fn get_entry(&self, span: SpanId) -> Option<&SpanEntry<S>> {
        if span.source_id() != self.source_id {
            return None;
        }

        let index = span.id() as usize;

        self.spans.get(index)
    }

    /// Retrieves span data by ID.
    ///
    /// Returns a reference to the span data associated with the given [`SpanId`].
    ///
    /// # Returns
    ///
    /// - `Some(&S)` if the span exists and belongs to this table's source
    /// - `None` if the span doesn't exist or belongs to a different source
    ///
    /// # Examples
    ///
    /// Successful lookup:
    ///
    /// ```rust
    /// use hashql_core::span::{Span, SpanAncestors, SpanTable, TextRange};
    /// use hashql_diagnostics::source::SourceId;
    ///
    /// # struct MySpan { value: i32, range: TextRange }
    /// # impl hashql_core::span::Span for MySpan {
    /// #     fn range(&self) -> TextRange { self.range }
    /// # }
    /// let mut table = SpanTable::new(SourceId::new_unchecked(0));
    ///
    /// let span = MySpan {
    ///     value: 42,
    ///     range: TextRange::new(10.into(), 15.into()),
    /// };
    /// let span_id = table.insert(span, SpanAncestors::empty());
    ///
    /// let retrieved = table.get(span_id).expect("span exists");
    /// assert_eq!(retrieved.value, 42);
    /// assert_eq!(u32::from(retrieved.range().len()), 5u32);
    /// ```
    ///
    /// Cross-source lookup failure:
    ///
    /// ```rust
    /// use hashql_core::span::{SpanAncestors, SpanTable, TextRange};
    /// use hashql_diagnostics::source::SourceId;
    ///
    /// # struct MySpan { range: TextRange }
    /// # impl hashql_core::span::Span for MySpan {
    /// #     fn range(&self) -> TextRange { self.range }
    /// # }
    /// let mut table = SpanTable::new(SourceId::new_unchecked(0));
    /// let span = MySpan {
    ///     range: TextRange::new(0.into(), 10.into()),
    /// };
    /// let span_id = table.insert(span, SpanAncestors::empty());
    ///
    /// // Attempt lookup from wrong table
    /// let table2: SpanTable<MySpan> = SpanTable::new(SourceId::new_unchecked(1));
    /// assert!(table2.get(span_id).is_none());
    /// ```
    #[must_use]
    pub fn get(&self, span: SpanId) -> Option<&S> {
        self.get_entry(span).map(|entry| &entry.span)
    }

    fn absolute_impl(&self, span: SpanId, depth: usize) -> Option<SourceSpan>
    where
        S: Span,
    {
        assert!(
            depth <= 32,
            "Cannot resolve excessively deep span of {depth}, likely due to a circular dependency"
        );

        // Special case synthetic spans, which have no source location
        if span == SpanId::SYNTHETIC {
            return Some(SourceSpan::from_parts(
                self.source_id,
                TextRange::empty(TextSize::new(0)),
            ));
        }

        let entry = self.get_entry(span)?;
        let ancestors = &self.ancestors[entry.ancestors.clone()];

        let (base, rest) = match ancestors {
            [] => return Some(SourceSpan::from_parts(span.source_id(), entry.span.range())),
            [base, rest @ ..] => (*base, rest),
        };

        let mut base = self.absolute_impl(base, depth + 1)?.range();
        for &ancestor in rest {
            let ancestor = self.absolute_impl(ancestor, depth + 1)?.range();

            base = match entry.mode {
                SpanResolutionMode::Intersection => base.intersect(ancestor)?,
                SpanResolutionMode::Union => base.cover(ancestor),
            };
        }

        let range = entry.span.range() + base.start();
        Some(SourceSpan::from_parts(span.source_id(), range))
    }

    /// Resolves a span to its absolute source position.
    ///
    /// Computes the absolute position of a span by traversing its ancestor chain and applying the
    /// appropriate resolution mode.
    ///
    /// # Returns
    ///
    /// - `Some(SourceSpan)` containing the absolute source position
    /// - `None` if resolution fails
    ///
    /// # Resolution Failures
    ///
    /// Resolution can fail in several scenarios:
    /// - **Invalid span ID**: Span doesn't exist in this table.
    /// - **Source mismatch**: Span belongs to a different source.
    /// - **Missing ancestors**: Referenced ancestor spans don't exist.
    /// - **Intersection failure**: Intersection mode with non-overlapping ancestors.
    /// - **Circular dependencies**: Ancestor chain is excessively deep (depth > 32).
    ///
    /// # Performance
    ///
    /// Resolution time is O(k) where k is the total number of spans in the
    /// ancestor chain. Most spans have shallow hierarchies, making resolution
    /// fast in practice.
    ///
    /// # Examples
    ///
    /// Root span resolution:
    ///
    /// ```rust
    /// use hashql_core::span::{SpanAncestors, SpanTable, TextRange};
    /// use hashql_diagnostics::source::SourceId;
    ///
    /// # struct MySpan { range: TextRange }
    /// # impl hashql_core::span::Span for MySpan {
    /// #     fn range(&self) -> TextRange { self.range }
    /// # }
    /// let mut table = SpanTable::new(SourceId::new_unchecked(5));
    ///
    /// let span_data = MySpan {
    ///     range: TextRange::new(10.into(), 20.into()),
    /// };
    /// let span_id = table.insert(span_data, SpanAncestors::empty());
    ///
    /// let absolute = table.absolute(span_id).expect("resolution succeeds");
    /// assert_eq!(absolute.source(), SourceId::new_unchecked(5));
    /// assert_eq!(absolute.range(), TextRange::new(10.into(), 20.into()));
    /// ```
    ///
    /// Hierarchical span resolution with union:
    ///
    /// ```rust
    /// use hashql_core::span::{SpanAncestors, SpanTable, TextRange};
    /// use hashql_diagnostics::source::SourceId;
    ///
    /// # struct MySpan { range: TextRange }
    /// # impl hashql_core::span::Span for MySpan {
    /// #     fn range(&self) -> TextRange { self.range }
    /// # }
    /// let mut table = SpanTable::new(SourceId::new_unchecked(0));
    ///
    /// // Base span: [0, 100]
    /// let base = MySpan {
    ///     range: TextRange::new(0.into(), 100.into()),
    /// };
    /// let base_id = table.insert(base, SpanAncestors::empty());
    ///
    /// // Child span: [10, 20] relative to base
    /// let child = MySpan {
    ///     range: TextRange::new(10.into(), 20.into()),
    /// };
    /// let child_id = table.insert(child, SpanAncestors::union(&[base_id]));
    ///
    /// let absolute = table.absolute(child_id).expect("resolution succeeds");
    /// // Result: base [0, 100] + child offset 10 = [10, 20]
    /// assert_eq!(absolute.range(), TextRange::new(10.into(), 20.into()));
    /// ```
    ///
    /// Resolution failure due to intersection:
    ///
    /// ```rust
    /// use hashql_core::span::{SpanAncestors, SpanTable, TextRange};
    /// use hashql_diagnostics::source::SourceId;
    ///
    /// # struct MySpan { range: TextRange }
    /// # impl hashql_core::span::Span for MySpan {
    /// #     fn range(&self) -> TextRange { self.range }
    /// # }
    /// let mut table = SpanTable::new(SourceId::new_unchecked(0));
    ///
    /// // Non-overlapping ancestors
    /// let ancestor1 = MySpan {
    ///     range: TextRange::new(0.into(), 10.into()),
    /// };
    /// let ancestor2 = MySpan {
    ///     range: TextRange::new(20.into(), 30.into()),
    /// };
    /// let ancestor1_id = table.insert(ancestor1, SpanAncestors::empty());
    /// let ancestor2_id = table.insert(ancestor2, SpanAncestors::empty());
    ///
    /// // Child with intersection mode
    /// let child = MySpan {
    ///     range: TextRange::new(0.into(), 5.into()),
    /// };
    /// let ancestor_ids = [ancestor1_id, ancestor2_id];
    /// let ancestors = SpanAncestors::intersection(&ancestor_ids);
    /// let child_id = table.insert(child, ancestors);
    ///
    /// // Resolution fails due to no intersection between [0,10] and [20,30]
    /// assert!(table.absolute(child_id).is_none());
    /// ```
    #[must_use]
    pub fn absolute(&self, span: SpanId) -> Option<SourceSpan>
    where
        S: Span,
    {
        self.absolute_impl(span, 0)
    }

    /// Computes all ancestor spans for a given span in linearized order.
    ///
    /// Returns a flattened list of all spans that are ancestors of the given span,
    /// traversing the entire ancestor tree and removing duplicates. The result
    /// includes both direct ancestors and ancestors-of-ancestors.
    ///
    /// # Returns
    ///
    /// A [`Vec<SpanId>`] containing all unique ancestor spans. The order is
    /// determined by the traversal algorithm and may not be hierarchical.
    ///
    /// # Algorithm
    ///
    /// Uses a depth-first search with a stack to traverse the ancestor tree:
    /// 1. Start with the given span
    /// 2. For each span, add its direct ancestors to the result and stack
    /// 3. Continue until all ancestors are processed
    /// 4. Duplicates are automatically filtered during traversal
    ///
    /// # Performance
    ///
    /// Time complexity is O(n) where n is the total number of unique ancestors.
    /// Space complexity is also O(n) for the result vector and traversal stack.
    ///
    /// # Examples
    ///
    /// Simple hierarchy:
    ///
    /// ```rust
    /// use hashql_core::span::{SpanAncestors, SpanTable, TextRange};
    /// use hashql_diagnostics::source::SourceId;
    ///
    /// # struct MySpan { range: TextRange }
    /// # impl hashql_core::span::Span for MySpan {
    /// #     fn range(&self) -> TextRange { self.range }
    /// # }
    /// let mut table = SpanTable::new(SourceId::new_unchecked(0));
    ///
    /// // Create hierarchy: grandparent -> parent -> child
    /// let grandparent = MySpan {
    ///     range: TextRange::new(0.into(), 100.into()),
    /// };
    /// let grandparent_id = table.insert(grandparent, SpanAncestors::empty());
    ///
    /// let parent = MySpan {
    ///     range: TextRange::new(10.into(), 50.into()),
    /// };
    /// let parent_id = table.insert(parent, SpanAncestors::union(&[grandparent_id]));
    ///
    /// let child = MySpan {
    ///     range: TextRange::new(20.into(), 30.into()),
    /// };
    /// let child_id = table.insert(child, SpanAncestors::union(&[parent_id]));
    ///
    /// let ancestors = table.ancestors(child_id);
    /// // Result contains both parent_id and grandparent_id
    /// assert_eq!(ancestors.len(), 2);
    /// assert!(ancestors.contains(&parent_id));
    /// assert!(ancestors.contains(&grandparent_id));
    /// ```
    ///
    /// Complex hierarchy with multiple branches:
    ///
    /// ```rust
    /// use hashql_core::span::{SpanAncestors, SpanTable, TextRange};
    /// use hashql_diagnostics::source::SourceId;
    ///
    /// # struct MySpan { range: TextRange }
    /// # impl hashql_core::span::Span for MySpan {
    /// #     fn range(&self) -> TextRange { self.range }
    /// # }
    /// let mut table = SpanTable::new(SourceId::new_unchecked(0));
    ///
    /// // Create diamond-shaped hierarchy
    /// let root = MySpan {
    ///     range: TextRange::new(0.into(), 100.into()),
    /// };
    /// let root_id = table.insert(root, SpanAncestors::empty());
    ///
    /// let left = MySpan {
    ///     range: TextRange::new(10.into(), 40.into()),
    /// };
    /// let left_id = table.insert(left, SpanAncestors::union(&[root_id]));
    ///
    /// let right = MySpan {
    ///     range: TextRange::new(60.into(), 90.into()),
    /// };
    /// let right_id = table.insert(right, SpanAncestors::union(&[root_id]));
    ///
    /// let merge = MySpan {
    ///     range: TextRange::new(5.into(), 15.into()),
    /// };
    /// let merge_id = table.insert(merge, SpanAncestors::union(&[left_id, right_id]));
    ///
    /// let ancestors = table.ancestors(merge_id);
    /// // Result contains all unique ancestors: left_id, right_id, root_id
    /// assert_eq!(ancestors.len(), 3);
    /// ```
    #[must_use]
    pub fn ancestors(&self, span: SpanId) -> Vec<SpanId> {
        let mut ancestors = Vec::new();
        let mut stack = vec![span];

        while let Some(current) = stack.pop() {
            let Some(entry) = self.get_entry(current) else {
                continue;
            };

            let direct_ancestors = &self.ancestors[entry.ancestors.clone()];

            if direct_ancestors.is_empty() {
                continue;
            }

            for &ancestor in direct_ancestors {
                if ancestors.contains(&ancestor) {
                    continue;
                }

                ancestors.push(ancestor);
                stack.push(ancestor);
            }
        }

        ancestors
    }
}
