# jf-ai-dlc

An open-source, self-hosted port of the **AI-DLC v2** methodology and the
**Collaborative AI-DLC** platform. All AWS services are replaced with OSS
components: Docker Compose for testing, Kubernetes (Helm) for production.

Built from two regularly-updated upstreams, vendored via `git subtree`
(pinned refs in [UPSTREAM_VERSIONS.md](UPSTREAM_VERSIONS.md)):

| Upstream | What it provides | Docs (pinned version) |
|---|---|---|
| [awslabs/aidlc-workflows @ v2](https://github.com/awslabs/aidlc-workflows/tree/v2) | The AI-DLC methodology: 33 stages / 14 agents, rendered as per-harness distributions for Claude Code and Codex | [docs](https://github.com/awslabs/aidlc-workflows/tree/v2/docs) |
| [aws-samples/sample-collaborative-ai-dlc @ v2.0.0](https://github.com/aws-samples/sample-collaborative-ai-dlc/tree/v2.0.0) | The collaboration platform: shared intents, approval gates, realtime editing, agent session orchestration | [docs](https://github.com/aws-samples/sample-collaborative-ai-dlc/tree/v2.0.0/docs) |

## System overview

```
                       ┌────────────────────────────────────────────────┐
                       │                 consuming project              │
                       │  plugins/claude (.claude/, aidlc/, .mcp.json)  │
                       │  plugins/codex  (.codex/, .agents/, AGENTS.md) │
                       └───────────────┬────────────────────────────────┘
                                       │ (optional) collab MCP entry — the on/off switch
                                       ▼
  frontend (SPA) ──► api-router ──► upstream lambda handlers (in-process)
        │                │                │           │
        │                ▼                ▼           ▼
        │           Keycloak         PostgreSQL   Gremlin Server /
        │           (OIDC)          (dynamo-pg     JanusGraph
        │                            adapter)     (graph/traceability)
        ▼
  ws-gateway ◄── ws-fanout          SeaweedFS (S3 API: artifacts, attachments)
  yjs-server (realtime docs)
                                    session-runner ──► agentcore containers
                                    (compose: docker / prod: k8s Jobs)
                                    inference: direct Anthropic/OpenAI keys
```

## AWS → OSS mapping

| AWS service (upstream) | Replacement here | How |
|---|---|---|
| Neptune (Gremlin) | Gremlin Server (compose) / JanusGraph (k8s) | env: `NEPTUNE_ENDPOINT`, `GREMLIN_PORT`, `GREMLIN_PROTOCOL` |
| DynamoDB | PostgreSQL | `overlay/dynamo-pg` — DynamoDBDocumentClient-compatible adapter |
| S3 | SeaweedFS | env: `AWS_ENDPOINT_URL_S3` (path-style, static creds) |
| Cognito | Keycloak | `overlay/auth-keycloak` (JWKS verify, admin API adapter, frontend OIDC shim) |
| API Gateway (HTTP) | `overlay/api-router` | route table generated from upstream terraform by `scripts/gen-routes.mjs` |
| API Gateway (WebSocket) | `overlay/ws-gateway` | PostToConnection-compatible mgmt endpoint for `ws-fanout` |
| Lambda / ECS Fargate | long-running containers | api-router, ws-gateway, yjs-server, session-runner |
| Bedrock AgentCore | plain containers / k8s Jobs | `overlay/session-runner` replaces the control plane |
| Bedrock inference | direct Anthropic / OpenAI API keys | env-driven; a LiteLLM base-URL can be swapped in later without code changes |
| Secrets Manager / SSM | env vars / k8s Secrets | `overlay/secrets-env` shims |
| CloudFront + S3 hosting | static frontend container behind ingress | `deploy/` |

## Repository layout

```
upstream/            git subtree vendors — never hand-edit
overlay/             all local code: adapters + patches/ (in-tree diffs)
plugins/             vendored aidlc dists for Claude Code + Codex (transformed)
deploy/compose/      full test stack (docker compose)
deploy/helm/         production chart
scripts/             update-upstream.sh, gen-routes.mjs, install-plugin.sh
```

## Local adjustments vs upstream

Every deviation from upstream is listed here. (Kept current — update this
section whenever a patch or transform is added.)

### Plugin transforms (`plugins/` vs `upstream/aidlc-workflows/dist/`)
- AWS-specific MCP servers (`aws-mcp`, `aws-pricing`, `aws-iac`, `aws-serverless`)
  are stripped from `.mcp.json` / `.codex/config.toml`.
- A templated **collab** MCP entry is available but disabled by default;
  `scripts/install-plugin.sh --with-collab` enables it. Removing the entry is
  the supported way to turn collaboration off for small projects.

### Platform adapters (`overlay/`, no upstream diff)
- `dynamo-pg`, `api-router`, `ws-gateway`, `auth-keycloak`, `secrets-env`,
  `session-runner` — see the mapping table above.

### In-tree patches (`overlay/patches/`)
- (none yet — populated during Phase 2)

## Usage

_Work in progress — sections below are filled in as the corresponding phase lands._

- **Install the AI-DLC plugin into a project:** `scripts/install-plugin.sh <target> claude|codex|both [--with-collab|--no-collab]`
- **Run the test stack:** `docker compose -f deploy/compose/docker-compose.yml up`
- **Deploy to k8s:** `helm install jf-ai-dlc deploy/helm/jf-ai-dlc`
- **Update upstreams:** `scripts/update-upstream.sh` (subtree pull → re-apply patches → regen routes → re-vendor plugins → run tests)
