# Requirements & dependencies

Everything jf-ai-dlc needs falls into two groups: **host tooling** you install
on the machine that builds and drives the stack, and the **runtime
services/images** the stack itself is made of. All runtime substitutions are
OSI-approved OSS — that is the whole point (see [Why this project
exists](why.md)).

## Host tooling

Install these on the build/operate machine.

| Tool | Version | Why it's needed | Homepage | License |
|---|---|---|---|---|
| Docker + Docker Compose | current | Build and run the whole test stack (`deploy/compose`) and the images. | https://www.docker.com | Apache-2.0 (Engine) |
| Node.js | 22.x | Runs the `overlay/` services and the `scripts/*.mjs` generators; also the container base image. | https://nodejs.org | MIT / others |
| Bun | ≥ 1.3 | Only for `scripts/build-plugin.sh` — upstream's packager (`bun scripts/package.ts`) renders `core/` → `dist/` before the OSS plugin transforms. Use `build-plugin.sh --from-dist` to skip it. | https://bun.sh | MIT |
| Helm + kubectl | Helm 3.x | Production deploy of the chart in `deploy/helm/jf-ai-dlc`. Not needed for the Compose stack. | https://helm.sh | Apache-2.0 |
| git | current | The upstreams are vendored via `git subtree`; updates use it (see [Updating the upstreams](upstream-updates.md)). | https://git-scm.com | GPL-2.0 |

## Runtime services / images (the Compose stack)

These are pulled or built by `deploy/compose/docker-compose.yml`. Each replaces
an AWS managed service; the full mapping is in the root
[`README.md`](../README.md). See [Docker images & Compose](docker.md) for how
each one is wired.

| Component | Image / version | Replaces (AWS) | Homepage | License |
|---|---|---|---|---|
| PostgreSQL | `postgres:17-alpine` | Backing store for dynamo-pg (DynamoDB) and aws-shim (SSM/Secrets) | https://www.postgresql.org | PostgreSQL License |
| Apache TinkerPop Gremlin Server | `tinkerpop/gremlin-server:3.7.3` | Neptune (graph / traceability) — dev/test | https://tinkerpop.apache.org | Apache-2.0 |
| JanusGraph | (prod, via its own chart) | Neptune (graph) — production, Gremlin-compatible | https://janusgraph.org | Apache-2.0 |
| SeaweedFS | `chrislusf/seaweedfs:3.80` | S3 (artifacts, attachments) via its S3 API | https://github.com/seaweedfs/seaweedfs | Apache-2.0 |
| Keycloak | `quay.io/keycloak/keycloak:26.3` | Cognito (OIDC auth + admin user management) | https://www.keycloak.org | Apache-2.0 |
| nginx | `nginx:1.27-alpine` | CloudFront + S3 static hosting (serves the SPA) | https://nginx.org | BSD-2-Clause |
| Node.js (base) | `node:22-alpine` | Lambda/Fargate compute (base for the overlay services image) | https://nodejs.org | MIT / others |

The jf-ai-dlc-authored images (`jf-ai-dlc-services`, `jf-ai-dlc-frontend`) and
the two Compose-built upstream images (`yjs-server`, `agentcore`) are described
in [Docker images & Compose](docker.md).

## Optional — agent execution & inference

Running actual agent stages (the `--profile agents` path) needs model
inference. jf-ai-dlc uses **direct provider APIs**:

- `ANTHROPIC_API_KEY` — Claude Code agent driver.
- `OPENAI_API_KEY` — Codex agent driver.

Set them in `deploy/compose/.env` before `docker compose --profile agents up`.
The model/auth resolution is env-driven, so a **LiteLLM** gateway can be adopted
later (point the agent CLI base-URL envs at it) with no code change.

## Pinned upstream versions

The two vendored upstreams and their exact commits are recorded in
[`../UPSTREAM_VERSIONS.md`](../UPSTREAM_VERSIONS.md). They are consumed as source
(vendored under `upstream/`), not installed as packages.
