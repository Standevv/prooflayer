"""Repository-grounded architecture context for read-only ProofLayer clients."""

from .catalog import (
    ArchitectureCatalogError,
    architecture_request_for_query,
    get_architecture_context,
)

__all__ = [
    "ArchitectureCatalogError",
    "architecture_request_for_query",
    "get_architecture_context",
]
