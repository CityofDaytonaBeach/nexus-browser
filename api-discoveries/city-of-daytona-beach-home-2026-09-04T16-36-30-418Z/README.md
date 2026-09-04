# Discovered API Endpoints

Captured from: https://codb.civicweb.net/portal/

Files:
- `endpoints.json`: normalized endpoint catalog with auth classification.
- `openapi.json`: OpenAPI 3.1 document generated from observed traffic.
- `opencode-api-prompt.md`: instructions for OpenCode to create wrappers, clients, or server mocks.

Public endpoints observed: 4
Authenticated endpoints observed: 0

## Endpoints
- GET https://codb.civicweb.net/api/system/cookie?name=%7Bname%7D&_=%7B_%7D - no auth signal observed
- GET https://codb.civicweb.net/api/getboxcastlivebroadcasts?_=%7B_%7D - no auth signal observed
- GET https://codb.civicweb.net/Services/MeetingsService.svc/meetings?from=%7Bfrom%7D&to=%7Bto%7D&_=%7B_%7D - no auth signal observed
- GET https://docaccess.com/domains/codb.civicweb.net/domain.json - no auth signal observed

Security note: sensitive headers and body fields are redacted. Do not ship captured cookies, bearer tokens, or private keys.
