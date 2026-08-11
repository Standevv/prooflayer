"""Safe public status models for the ProofLayer Developer Platform."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DeveloperComponentStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["AVAILABLE", "UNAVAILABLE", "CONNECTED", "UNCONFIGURED"]
    detail: str
    authenticity_labels: list[str] = Field(default_factory=list)


class DeveloperContractReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Literal["CertificateRegistry", "PolicyGate", "DecisionLog"]
    purpose: str
    address: str
    network: Literal["X Layer Testnet"] = "X Layer Testnet"
    chain_id: Literal[1952] = 1952


class DeveloperPlatformStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    api: DeveloperComponentStatus
    xlayer: DeveloperComponentStatus
    ai_agent: DeveloperComponentStatus
    deterministic_verification: DeveloperComponentStatus
    openapi: DeveloperComponentStatus
    latest_block: int | None = Field(default=None, ge=0)
    network: Literal["X Layer Testnet"] = "X Layer Testnet"
    chain_id: Literal[1952] = 1952
    contracts: list[DeveloperContractReference]
    openapi_path: Literal["/openapi.json"] = "/openapi.json"
    api_status: Literal["MVP / PRE-PRODUCTION"] = "MVP / PRE-PRODUCTION"
    write_operations_exposed: Literal[False] = False
    blockchain_write_performed: Literal[False] = False


__all__ = [
    "DeveloperComponentStatus",
    "DeveloperContractReference",
    "DeveloperPlatformStatus",
]
