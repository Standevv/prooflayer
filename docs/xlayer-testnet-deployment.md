# ProofLayer deployment to X Layer Testnet

This workflow prepares and deploys the three ProofLayer enforcement contracts to X Layer Testnet. Running the connectivity check is read-only. Deployment occurs only when the deployment command is run explicitly.

## Network

| Setting | Value |
| --- | --- |
| Hardhat network name | `xlayerTestnet` |
| Chain ID | `1952` |
| Default RPC | `https://testrpc.xlayer.tech/terigon` |
| Alternative RPC | `https://xlayertestrpc.okx.com/terigon` |
| Native gas token | Testnet OKB |
| Explorer | `https://www.okx.com/web3/explorer/xlayer-test` |

The Hardhat configuration uses the default public RPC when `XLAYER_TESTNET_RPC_URL` is empty or unset. Set the variable to use the alternative RPC or another trusted endpoint.

## Environment variables

Copy `.env.example` to `.env` and fill in:

```dotenv
XLAYER_TESTNET_RPC_URL=https://testrpc.xlayer.tech/terigon
DEPLOYER_PRIVATE_KEY=0xYOUR_TESTNET_DEPLOYER_PRIVATE_KEY
```

- `XLAYER_TESTNET_RPC_URL` is optional because the project has a public default.
- `DEPLOYER_PRIVATE_KEY` is required for the connectivity and deployment scripts. Use the key for the funded X Layer testnet deployer only.
- `.env` files are ignored by Git; `.env.example` contains no secrets and remains trackable.

Never commit, paste into documentation, or share the private key. Do not reuse a production or mainnet-funded key for testnet deployment.

## Obtain testnet OKB

Use the OKX Wallet testnet faucet. In the app, open **More > Testnet faucet**; on the web, open **Toolkit > Testnet faucet**. Select X Layer Testnet, connect the deployer wallet, complete the displayed requirements, and claim testnet OKB. Faucet eligibility and limits can change, so follow the requirements shown in the wallet. See the [official OKX testnet faucet instructions](https://www.okx.com/en-gb/help/what-is-testnet-faucets).

The connectivity check below confirms the deployer address and its OKB balance before deployment.

## Connectivity check

Run:

```bash
npm run check:xlayer
```

The script prints the chain ID, latest block, deployer address, and deployer OKB balance. It fails before doing anything else if the connected chain ID is not `1952`.

## Deploy

First run the local verification commands:

```bash
npx hardhat build
npx hardhat test
npx tsc --noEmit
```

Review the selected deployer address and balance with the connectivity check. When ready to broadcast the deployment explicitly, run:

```bash
npm run deploy:xlayer
```

The npm deployment command uses the `production` Solidity build profile (optimizer enabled with 200 runs). The deployment script has its own chain ID guard and refuses to deploy unless the connected chain ID is `1952`; it also refuses to begin if the deployer has a zero OKB balance.

## Deployment order and wiring

The script deploys and configures contracts in this order:

1. `ProofLayerCertificateRegistry`
2. `ProofLayerDecisionLog`
3. `ProofLayerPolicyGate`, constructed with the Registry and DecisionLog addresses
4. Authorize `ProofLayerPolicyGate` as a writer in `ProofLayerDecisionLog`

After the authorization transaction is mined, the script asserts:

- Registry owner equals the deployer.
- DecisionLog owner equals the deployer.
- PolicyGate references the deployed Registry.
- PolicyGate references the deployed DecisionLog.
- DecisionLog recognizes PolicyGate as an authorized writer.

The script prints all three addresses again only after these assertions pass.

## Verify deployment addresses

Open the [X Layer Testnet explorer](https://www.okx.com/web3/explorer/xlayer-test) and search each printed contract address. Confirm that each address has contract-creation bytecode and that the creation transaction originated from the expected deployer. Also inspect the DecisionLog authorization transaction.

Save the addresses and transaction hashes in a deployment record. The current script does not submit source-code verification to the explorer.
