# Why this project exists

## The problem

AWS published **AI-DLC** (the AI-Driven Development Life Cycle) — a structured,
gated methodology of 33 stages and 14 agents, shipped as
[`awslabs/aidlc-workflows`](https://github.com/awslabs/aidlc-workflows). It's
rendered as per-harness distributions you copy into a project to run `/aidlc`
in Claude Code or Codex.

Upstream ships those distributions wired for an **AWS-centric** default: the
Claude `.mcp.json` bundles AWS MCP servers, and the Codex config defaults to
**Amazon Bedrock** for inference. That's a fine default at AWS, but it means the
out-of-the-box plugin assumes AWS credentials and Bedrock model access.

## What this project does about it

`jf-ai-dlc` re-packages the **exact same methodology** with the AWS assumptions
removed, so the plugin is provider-neutral out of the box:

- The Claude plugin drops the AWS MCP servers (keeps `context7`).
- The Codex plugin defaults to **native OpenAI auth** instead of Bedrock (model
  IDs de-prefixed, the Bedrock provider block commented out).
- An optional **collaboration** MCP toggle points the plugin at a
  [jf-ai-dlc-collaboration](../../jf-ai-dlc-collaboration) platform deployment
  when you want the shared team experience — off by default.

Crucially, it does this **without modifying the upstream code**. The upstream is
vendored verbatim under `upstream/aidlc-workflows/`, and the transforms run on
the *generated* distributions in `scripts/vendor-plugins.mjs`. The build is
reproducible — rebuilding from an unchanged `core/` yields byte-identical
plugins — so pulling a newer upstream version stays cheap (see
[Updating the upstream](upstream-updates.md)).

## Standing on the shoulders of giants

**This project is a packaging and adapter layer, not a reimplementation.** The
AI-DLC methodology, the 14 agents, the stage protocol, the tools and hooks — all
of the substance — are the work of **AWS Labs**. This project contributes only
the OSS packaging transforms and the build/install tooling.

Please credit and support the upstream project:

| Upstream | Homepage | Vendored version | License |
|---|---|---|---|
| AI-DLC Workflows | https://github.com/awslabs/aidlc-workflows | [`v2`](https://github.com/awslabs/aidlc-workflows/tree/v2) | MIT No Attribution — [`upstream/aidlc-workflows/LICENSE`](../upstream/aidlc-workflows/LICENSE) |

The upstream license governs everything under `upstream/aidlc-workflows/**`;
this project's scripts, transforms, and docs are separate. The exact pinned
commit is recorded in [`../UPSTREAM_VERSIONS.md`](../UPSTREAM_VERSIONS.md).

The **collaboration platform** built on the same methodology
(`aws-samples/sample-collaborative-ai-dlc`) is OSS-ported separately in the
sibling repo [jf-ai-dlc-collaboration](../../jf-ai-dlc-collaboration).

Upstream documentation (pinned version):

- AI-DLC guide & reference: https://github.com/awslabs/aidlc-workflows/tree/v2/docs
