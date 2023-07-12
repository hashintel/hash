"""Replicates the Block Protocol type system for use in Python."""

# This solution is not great as it _could_ lead to circular imports. However,
# it is the best solution we have for now. The alternative is to have a single
# file that contains all of the schemas, but that is not very maintainable.
#
# If we run into issues with circular imports, we can refactor this to use
# direct imports. For example, instead of importing `DataTypeSchema` from
# `typesystem`, we can import it from `typesystem.data_type`.
from .data_type import DataTypeSchema as DataTypeSchema
from .entity_type import EntityTypeSchema as EntityTypeSchema
from .property_type import PropertyTypeSchema as PropertyTypeSchema
