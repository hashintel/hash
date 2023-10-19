"""Base classes for all schemas."""

from abc import ABC

from pydantic import BaseModel


class Schema(BaseModel, ABC):
    """Base class for all schemas."""


class OntologyTypeSchema(Schema, ABC):
    """Base class for all ontology type schemas."""
