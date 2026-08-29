# jf-ai-dlc documentation

**jf-ai-dlc** re-hosts AWS's AI-DLC methodology and Collaborative AI-DLC
platform on strictly open-source components — Docker Compose for testing,
Kubernetes for production, no AWS dependency. It stands on the shoulders of two
upstream projects and adds only an adapter/overlay layer around them; see
[Why this project exists](why.md).

For the architecture overview, the full AWS→OSS mapping, and the enumerated
list of local adjustments, see the root [`README.md`](../README.md). These docs
go deeper on specific topics.

## Contents

| Doc | What it covers |
|---|---|
| [Why this project exists](why.md) | The problem it solves, and prominent credit to the upstream projects it builds on (standing on the shoulders of giants) |
| [Requirements & dependencies](requirements.md) | Host tooling and runtime services needed to build and run, with versions, purposes, homepages, and licenses |
| [Updating the upstreams](upstream-updates.md) | How to fetch a newer version of AI-DLC and Collaborative AI-DLC through the git-subtree + overlay pipeline |
| [Docker images & Compose](docker.md) | Every image (custom and third-party) and a service-by-service tour of the Compose stack |

## Quick links

- Root overview & AWS→OSS mapping: [`../README.md`](../README.md)
- Pinned upstream versions: [`../UPSTREAM_VERSIONS.md`](../UPSTREAM_VERSIONS.md)
- AI-DLC Workflows (upstream): https://github.com/awslabs/aidlc-workflows
- Collaborative AI-DLC (upstream): https://github.com/aws-samples/sample-collaborative-ai-dlc
