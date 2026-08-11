"""Canonical trust-source registry for Phase 2B provenance independence.

This module is intentionally minimal and static for the current MVP. It only
maps configured sources to the family of trust they are intended to represent.
It is not a cryptographic or operational independence proof.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SourceRegistryEntry:
    source_id: str
    canonical_name: str
    source_type: str
    trust_domain: str
    operator: str
    independence_group: str
    enabled: bool = True


SOURCE_REGISTRY: dict[str, SourceRegistryEntry] = {
    "ondo": SourceRegistryEntry(
        source_id="ondo",
        canonical_name="Ondo",
        source_type="issuer",
        trust_domain="ondo",
        operator="Ondo Finance",
        independence_group="ondo",
        enabled=True,
    ),
    "paxos": SourceRegistryEntry(
        source_id="paxos",
        canonical_name="Paxos",
        source_type="issuer",
        trust_domain="paxos",
        operator="Paxos",
        independence_group="paxos",
        enabled=True,
    ),
    "kpmg": SourceRegistryEntry(
        source_id="kpmg",
        canonical_name="KPMG",
        source_type="attestation",
        trust_domain="kpmg",
        operator="KPMG LLP",
        independence_group="kpmg",
        enabled=True,
    ),
    "ankura": SourceRegistryEntry(
        source_id="ankura",
        canonical_name="Ankura Trust Company",
        source_type="attestation",
        trust_domain="ankura",
        operator="Ankura Trust Company, LLC",
        independence_group="ankura",
        enabled=True,
    ),
    "ethereum": SourceRegistryEntry(
        source_id="ethereum",
        canonical_name="Ethereum",
        source_type="onchain",
        trust_domain="ethereum",
        operator="Ethereum",
        independence_group="ethereum",
        enabled=True,
    ),
    "xlayer": SourceRegistryEntry(
        source_id="xlayer",
        canonical_name="X Layer",
        source_type="onchain",
        trust_domain="xlayer",
        operator="X Layer",
        independence_group="xlayer",
        enabled=True,
    ),
    "chainlink": SourceRegistryEntry(
        source_id="chainlink",
        canonical_name="Chainlink",
        source_type="oracle",
        trust_domain="chainlink",
        operator="Chainlink",
        independence_group="chainlink",
        enabled=True,
    ),
}


def resolve_source_registry(source_id: str | None) -> SourceRegistryEntry | None:
    if not isinstance(source_id, str):
        return None
    normalized = source_id.strip().lower()
    if not normalized:
        return None
    entry = SOURCE_REGISTRY.get(normalized)
    if entry is not None and entry.enabled:
        return entry
    aliases = {
        "ondo-finance": "ondo",
        "ondo-finance-issuer": "ondo",
        "paxos-token": "paxos",
        "kpmg-llp": "kpmg",
        "kpmg-llp-auditor": "kpmg",
        "ankura-trust": "ankura",
        "ankura-trust-company": "ankura",
        "eth": "ethereum",
        "ethereum-mainnet": "ethereum",
        "x-layer": "xlayer",
    }
    alias_target = aliases.get(normalized)
    if alias_target:
        return SOURCE_REGISTRY.get(alias_target)
    return None


__all__ = [
    "SOURCE_REGISTRY",
    "SourceRegistryEntry",
    "resolve_source_registry",
]
