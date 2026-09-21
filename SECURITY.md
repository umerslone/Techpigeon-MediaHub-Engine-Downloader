# Security Policy

## Supported Versions

This project is community-maintained and currently supports the latest `main` branch.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| older commits/releases | No |

## Reporting a Vulnerability

Please do not open a public issue for security vulnerabilities.

Use one of these private channels:

1. GitHub Security Advisories (preferred):
   - Open a private vulnerability report in the repository Security tab.
2. If advisories are not enabled:
   - Open a minimal issue without exploit details and request a private contact channel.

Include:

- A clear description of the vulnerability
- Reproduction steps
- Impact assessment
- Affected files/endpoints
- Suggested remediation (if available)

## Response Expectations

- Initial acknowledgement: within 7 days
- Triage and severity assessment: within 14 days
- Fix timeline: depends on severity and maintainer availability

## Scope

Examples of in-scope issues:

- Secret/token exposure in repository files
- Authentication/authorization bypasses
- Unsafe file handling or command execution paths
- SSRF, injection, and deserialization vulnerabilities

Out of scope:

- Vulnerabilities only affecting unsupported/deprecated dependencies without practical exploit path in this project
- Social engineering or phishing unrelated to the codebase

## Security Best Practices for Contributors

- Never commit credentials, private keys, or API tokens
- Keep `.env` and local config files out of source control
- Validate all external input in API handlers
- Prefer least-privilege defaults for any optional integrations
