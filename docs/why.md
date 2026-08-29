# Why this project exists

## The problem

AWS published two excellent things:

- **AI-DLC** (the AI-Driven Development Life Cycle) — a structured, gated
  methodology of 33 stages and 14 agents, shipped as
  [`awslabs/aidlc-workflows`](https://github.com/awslabs/aidlc-workflows).
- **Collaborative AI-DLC** — a reference platform that lets a team run that
  methodology together, with shared intents, approval gates, real-time editing,
  and orchestrated agent sessions, shipped as
  [`aws-samples/sample-collaborative-ai-dlc`](https://github.com/aws-samples/sample-collaborative-ai-dlc).

The methodology is cloud-neutral, but the reference platform is bound tightly to
AWS managed services: **DynamoDB, Neptune, Cognito, API Gateway (HTTP +
WebSocket), Bedrock AgentCore, S3, Secrets Manager, and SSM.** Running it means
provisioning and paying for AWS infrastructure, and it can't be self-hosted or
air-gapped.

## What jf-ai-dlc does about it

jf-ai-dlc re-hosts **the exact same methodology and platform** on **strictly
open-source components**, so a team can run the whole thing self-hosted:

- **Docker Compose** for local/testing, **Kubernetes (Helm)** for production.
- **No AWS dependency**, and **no proprietary or source-available licenses** —
  every substituted component is OSI-approved OSS (e.g. PostgreSQL, Apache
  TinkerPop/JanusGraph, SeaweedFS, Keycloak). See
  [Requirements & dependencies](requirements.md).

Crucially, it does this **without modifying the upstream code**. The upstream
projects are vendored verbatim under `upstream/`, and all local work lives in an
`overlay/` adapter layer plus a small `overlay/patches/` set. That keeps the
diff against upstream tiny, so pulling a newer upstream version stays cheap —
see [Updating the upstreams](upstream-updates.md). The full list of what changes
and why is in the root [`README.md`](../README.md) under *AWS → OSS mapping* and
*Local adjustments vs upstream*.

## Standing on the shoulders of giants

**This project is a packaging and adapter layer, not a reimplementation.** The
AI-DLC methodology, the 14 agents, the collaboration platform, its frontend, its
orchestration engine, and essentially all of the application logic are the work
of **AWS Labs** and **AWS Samples**. jf-ai-dlc contributes only the OSS
substitutions (a DynamoDB-compatible server on PostgreSQL, an API Gateway
replacement, a WebSocket gateway, a Keycloak auth shim, an AgentCore control-plane
replacement, and the deployment glue) that let their work run off-AWS.

Please credit and support the upstream projects:

| Upstream | Homepage | Vendored version | License |
|---|---|---|---|
| AI-DLC Workflows | https://github.com/awslabs/aidlc-workflows | [`v2`](https://github.com/awslabs/aidlc-workflows/tree/v2) | MIT No Attribution — [`upstream/aidlc-workflows/LICENSE`](../upstream/aidlc-workflows/LICENSE) |
| Collaborative AI-DLC | https://github.com/aws-samples/sample-collaborative-ai-dlc | [`v2.0.0`](https://github.com/aws-samples/sample-collaborative-ai-dlc/releases/tag/v2.0.0) | MIT No Attribution — [`upstream/collab/LICENSE`](../upstream/collab/LICENSE) |

Each upstream's own license governs everything under `upstream/**`; the
jf-ai-dlc overlay, deployment, and docs are separate. The exact pinned commits
are recorded in [`../UPSTREAM_VERSIONS.md`](../UPSTREAM_VERSIONS.md).

Upstream documentation (pinned versions):

- AI-DLC guide & reference: https://github.com/awslabs/aidlc-workflows/tree/v2/docs
- Collaborative AI-DLC docs: https://github.com/aws-samples/sample-collaborative-ai-dlc/tree/v2.0.0/docs
