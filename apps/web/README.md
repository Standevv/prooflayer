# ProofLayer web dashboard

Read-only Next.js frontend for the ProofLayer MVP on X Layer Testnet, including the AI-assisted verification console.

## Setup

From `apps/web`:

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

The public RPC environment variable contains no secret:

```dotenv
NEXT_PUBLIC_XLAYER_RPC_URL=https://testrpc.xlayer.tech/terigon
```

If it is omitted, the same public X Layer Testnet endpoint is used as the default.

The AI console uses a thin server-side gateway. Its optional internal service URL is not exposed to the browser:

```dotenv
PROOFLAYER_AGENT_API_URL=http://127.0.0.1:8010
```

Set `OPENAI_API_KEY` only in the repository-root `.env` used by the Python agent API. See [`docs/ai-verification-agent.md`](../../docs/ai-verification-agent.md) for setup and the security boundary.

## What the dashboard reads

- Chain ID and latest block from X Layer Testnet.
- The deployed certificate registry for USDY certificate registration, usability, issuer, and revocation state.
- PolicyGate wiring and executed-action count.
- DecisionLog count and the most recent matching decision event since deployment (bounded to the latest 100,000 blocks). Log reads use 100-block ranges to respect X Layer's public RPC limit.

Contract addresses are the existing ProofLayer X Layer Testnet deployment. The frontend does not submit transactions and does not request a wallet.

## Demo-data boundary

The verification result and provenance presentation use the existing exported USDY PASS certificate fixture in `data/demo`. Live registration, usability, issuer, revocation, counts, blocks, and decisions come from the RPC at request time and are labelled separately.

The PAXG adapter exists in the RVC backend, but no PAXG frontend certificate fixture is currently exported. Selecting PAXG therefore shows an explicit unavailable message rather than a fabricated result.

## Validation

```bash
npm run build
npm run lint
npm run typecheck
```
