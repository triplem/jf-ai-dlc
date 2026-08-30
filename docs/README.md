# jf-ai-dlc documentation

**jf-ai-dlc** packages AWS's AI-DLC methodology as an installable **plugin** for
Claude Code and Codex, built from the upstream `aidlc-workflows` sources with a
few OSS transforms. It stands on the shoulders of the upstream project and adds
only a packaging/adapter layer; see [Why this project exists](why.md).

> The **collaboration platform** (the self-hosted team server) lives in the
> sibling repo **[jf-ai-dlc-collaboration](../../jf-ai-dlc-collaboration)**. This
> repo is just the CLI plugin.

For build/install usage and the list of transforms, see the root
[`README.md`](../README.md). These docs go deeper on specific topics.

## Contents

| Doc | What it covers |
|---|---|
| [Why this project exists](why.md) | The problem it solves, and prominent credit to the upstream project it builds on |
| [Requirements & dependencies](requirements.md) | The (small) host tooling needed to build and install the plugin |
| [Updating the upstream](upstream-updates.md) | How to fetch a newer AI-DLC version through the git-subtree pipeline |

## Quick links

- Root overview & build/install: [`../README.md`](../README.md)
- Pinned upstream version: [`../UPSTREAM_VERSIONS.md`](../UPSTREAM_VERSIONS.md)
- AI-DLC Workflows (upstream): https://github.com/awslabs/aidlc-workflows
- The collaboration platform repo: [jf-ai-dlc-collaboration](../../jf-ai-dlc-collaboration)
