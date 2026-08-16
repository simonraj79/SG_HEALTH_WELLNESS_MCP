# Security Policy

## Supported version

Security fixes are applied to the current `1.x` release line.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability, exposed credential, or bypass. After this repository is published, use the hosting repository's private security-advisory feature and include:

- the affected route or tool;
- reproduction steps with secrets removed;
- expected and observed behavior;
- impact and any suggested mitigation.

Do not test against a public deployment in a way that degrades service or exceeds data.gov.sg limits. Use a local instance for proof-of-concept work.

## Deployment guidance

- Keep `DATA_GOV_SG_API_KEY` and `MCP_API_KEY` in Render secret environment variables, never source control.
- Set `MCP_API_KEY` if access should be limited to known users.
- Add custom domains to `ALLOWED_HOSTS`; add browser caller hostnames to `ALLOWED_ORIGINS`.
- Rotate a key immediately if it appears in logs, commits, screenshots, or client-visible errors.
- Review data.gov.sg licensing and attribution requirements before adding a new source.
