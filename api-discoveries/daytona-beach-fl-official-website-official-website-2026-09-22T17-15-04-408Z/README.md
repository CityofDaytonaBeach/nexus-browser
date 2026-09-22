# Discovered API Endpoints

Captured from: https://daytonabeach.gov/

Files:
- `endpoints.json`: normalized endpoint catalog with auth classification.
- `openapi.json`: OpenAPI 3.1 document generated from observed traffic.
- `mcp-tools.json`: MCP tool definitions inferred from endpoints.
- `mcp-server-stub.ts`: starter MCP server implementation stub.
- `code-intelligence.json`: architecture, database, model, and function guidance for coding agents.
- `sdk-agents/`: JavaScript, PHP, React, and Tailwind CSS SDK-agent prompts plus starter code.
- `opencode-api-prompt.md`: instructions for OpenCode to create wrappers, clients, or server mocks.

Public endpoints observed: 16
Authenticated endpoints observed: 0

## Endpoints
- GET https://daytonabeach.gov/antiforgery - no auth signal observed
- GET https://daytonabeach.gov/Toggle - no auth signal observed
- GET https://residentagent-api-production.azurewebsites.net/api/v1/public/agents/3e4af47e-b3e9-4b83-8bc1-ab65735efc32/configuration - no auth signal observed
- GET https://daytonabeach.gov/Pages/MenuMain/HiddenMainSubMenus?pageID=%7BpageID%7D&moduleID=%7BmoduleID%7D&themeID=%7BthemeID%7D&menuContainerID=%7BmenuContainerID%7D&_=%7B_%7D - no auth signal observed
- GET https://daytonabeach.gov/api/v1/SplashModal/Get?targetId=%7BtargetId%7D&targetType=%7BtargetType%7D&requestMode=%7BrequestMode%7D&_=%7B_%7D - no auth signal observed
- GET https://fonts.gstatic.com/s/muli/v34/7Auwp_0qiz-afTLGLQ.woff2 - no auth signal observed
- GET https://fonts.gstatic.com/s/muli/v34/7Aujp_0qiz-afTfcIyoiGtm2P0wG05Fz4eqVww.woff2 - no auth signal observed
- GET https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLCz7Z1xlFQ.woff2 - no auth signal observed
- GET https://fonts.gstatic.com/s/poppins/v24/pxiEyp8kv8JHgFVrJJfecg.woff2 - no auth signal observed
- GET https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLEj6Z1xlFQ.woff2 - no auth signal observed
- GET https://fonts.gstatic.com/s/yellowtail/v25/OZpGg_pnoDtINPfRIlLohlvHwQ.woff2 - no auth signal observed
- GET https://fonts.gstatic.com/s/opensans/v44/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS-muw.woff2 - no auth signal observed
- GET https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLGT9Z1xlFQ.woff2 - no auth signal observed
- GET https://docaccess.com/domains/daytonabeach.gov/domain.json - no auth signal observed
- POST https://www.google-analytics.com/g/collect?v=%7Bv%7D&tid=%7Btid%7D&gtm=%7Bgtm%7D&_p=%7B_p%7D&gcd=%7Bgcd%7D&npa=%7Bnpa%7D&dma=%7Bdma%7D&cid=%7Bcid%7D&frm=%7Bfrm%7D&ngs=%7Bngs%7D&pscdl=%7Bpscdl%7D&rcb=%7Brcb%7D&sr=%7Bsr%7D&uaa=%7Buaa%7D&uab=%7Buab%7D&uafvl=%7Buafvl%7D&uam=%7Buam%7D&uamb=%7Buamb%7D&uap=%7Buap%7D&uapv=%7Buapv%7D&uaw=%7Buaw%7D&ul=%7Bul%7D&_s=%7B_s%7D&tag_exp=%7Btag_exp%7D&sid=%7Bsid%7D&sct=%7Bsct%7D&seg=%7Bseg%7D&dl=%7Bdl%7D&dt=%7Bdt%7D&en=%7Ben%7D&_fv=%7B_fv%7D&_nsi=%7B_nsi%7D&_ss=%7B_ss%7D&_ee=%7B_ee%7D&tfd=%7Btfd%7D - no auth signal observed
- POST https://www.google-analytics.com/g/collect?v=%7Bv%7D&tid=%7Btid%7D&gtm=%7Bgtm%7D&_p=%7B_p%7D&gcd=%7Bgcd%7D&npa=%7Bnpa%7D&dma=%7Bdma%7D&cid=%7Bcid%7D&frm=%7Bfrm%7D&ngs=%7Bngs%7D&pscdl=%7Bpscdl%7D&rcb=%7Brcb%7D&sr=%7Bsr%7D&uaa=%7Buaa%7D&uab=%7Buab%7D&uafvl=%7Buafvl%7D&uam=%7Buam%7D&uamb=%7Buamb%7D&uap=%7Buap%7D&uapv=%7Buapv%7D&uaw=%7Buaw%7D&ul=%7Bul%7D&_s=%7B_s%7D&tag_exp=%7Btag_exp%7D&sid=%7Bsid%7D&sct=%7Bsct%7D&seg=%7Bseg%7D&dl=%7Bdl%7D&dt=%7Bdt%7D&en=%7Ben%7D&_fv=%7B_fv%7D&_ss=%7B_ss%7D&tfd=%7Btfd%7D - no auth signal observed

Security note: sensitive headers and body fields are redacted. Do not ship captured cookies, bearer tokens, or private keys.

Agent note: use `code-intelligence.json` before writing code. It explains inferred data models, database tables, SDK functions, auth strategy, and recommended project files.
