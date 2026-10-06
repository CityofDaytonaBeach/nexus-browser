You are the implementation executor for a NexusBrowser multi-agent build.

User request: build bike week landing page


PRODUCT ACCEPTANCE CONTRACT:
Build the user's product, never a dashboard describing Nexus or its development process unless explicitly requested.
Replace all pending scaffold content. Every visible primary action must implement its promised behavior.
Write .nexus/product-contract.json describing the actual requested user outcomes with accessible browser steps.
Schema example: {"product":"Task tracker","workflows":[{"name":"Create and retain a task","path":"/","steps":[{"action":"fill","target":{"role":"textbox","name":"New task"},"value":"Browser QA task"},{"action":"click","target":{"role":"button","name":"Add task"}},{"action":"expectText","text":"Browser QA task"},{"action":"reload"},{"action":"expectText","text":"Browser QA task"}]}]}.
Supported actions: click, fill(value), check, select(value), reload, expectText(text), expectVisible(target), expectValue(target,value), expectUrl(path).
Targets use exact accessible role/name or testId. Each workflow needs an interaction and an outcome assertion.
Optional mobileSteps can exercise an equivalent outcome through mobile-specific controls such as a collapsed menu.
Cover the core request, not incidental menu clicks; updates must extend these checks while preserving earlier outcomes.
Use local test data. Do not charge money, send messages, or touch production records during verification.
Nexus independently compiles and exercises these workflows on desktop and mobile, captures DOM/screenshots/console/network/overflow evidence, and returns failures to you for repair.
Nexus owns the preview server lifecycle. Do not run npm run dev, npm start, pnpm dev, yarn dev, or another long-running server in an executor tool. Validate the dev script configuration, finish implementation, and exit so Nexus can start the preview and browser QA. This applies to every implementation and repair specialist.
Do not weaken or remove assertions to hide a failure. Screenshot paths in repair evidence are real files: inspect them when making visual fixes.


UI look: faithful-clone

Build brain:
- Mode: opencode
- Provider: opencode
- Model: default
- Executor: opencode
- opencode local CLI performs planning, file edits, commands, and repair directly.

Preflight stack plan and assigned agents:
- Language: TypeScript
- Framework: React + Vite
- Runtime: Node.js
- Package manager: npm
- Setup: npm install
- Development: npm run dev -- --host 0.0.0.0 --port {port}
- Build checks: npm run build
- Tests: npm test -- --runInBand

Orchestrating agents:
- OpenCode Build Agent (opencode-build-agent): Execute the build plan, edit files, run commands, fix failures, and stream progress.
- Build Doctor Agent (build-doctor-agent): Diagnose the entire generated app lifecycle: workspace shape, package scripts, dependencies, env vars, APIs, database setup, build output, preview logs, tests, and deployment readiness.
- Full-Stack Expert Router (framework-expert-router): Routes build failures to official-source expert agents for languages, runtimes, frontend frameworks, backend frameworks, databases, ORMs, package managers, build tools, test tools, DevOps, cloud deploys, APIs, auth, payments, mobile, AI SDKs, and observability based on files, logs, dependencies, and error signatures.
- React Agent (react-agent): Create React pages, hooks, providers, routing, state, loading/error states, and UI/API wiring.
- QA Agent (qa-agent): Run browser QA, visual comparison, flow replay, accessibility checks, API tests, and repair tasks.
- Memory And Skills Agent (memory-agent): Persist project knowledge, summarize sessions, create reusable skills, and retrieve previous decisions.

Stack specialists:
- TypeScript Expert Agent (typescript), official source https://github.com/microsoft/TypeScript
  Check: tsconfig validity; strict-mode errors; module resolution; JSX config; missing @types packages
  Apply: fix compiler options; add missing types; repair imports/exports; align framework type settings
- Node.js Runtime Expert Agent (node), official source https://github.com/nodejs/node
  Check: engine mismatch; ESM/CJS mismatch; script failures; env handling
  Apply: fix scripts; align module type; repair server startup; add env validation
- React Expert Agent (react), official source https://github.com/facebook/react
  Check: invalid hooks; root render; hydration risks; accessibility
  Apply: fix render errors; repair component boundaries; wire loading/error states
- npm Expert Agent (npm), official source https://github.com/npm/cli
  Check: lockfile state; scripts; dependency ranges; install failures
  Apply: fix package scripts; repair lock/deps; stabilize npm install
- Vite Expert Agent (vite), official source https://github.com/vitejs/vite
  Check: dev script; build script; entry module; plugin config; env naming
  Apply: fix Vite config; repair index.html entry; resolve transform errors
- Playwright Expert Agent (playwright), official source https://github.com/microsoft/playwright
  Check: browser install; selectors; timeouts; visual tests
  Apply: fix Playwright config; repair tests; add stable locators
- OWASP AppSec Expert Agent (owasp), official source https://github.com/OWASP/Top10
  Check: injection; auth failures; secrets exposure; XSS; SSRF
  Apply: add validation; repair auth boundaries; harden headers; redact secrets
- Accessibility/WCAG Expert Agent (accessibility), official source https://github.com/w3c/wcag
  Check: semantic HTML; keyboard flow; contrast; ARIA correctness; screen-reader labels
  Apply: fix semantic markup; repair ARIA usage; add keyboard states; add accessibility tests

The complete persisted plan is in .nexus/stack-plan.json and the specialist manifest is in .nexus/agents/selected-experts.md. Read both before editing.

Agent orchestration contract:
1. Framework Expert Router validates the planned stack against the request and current files. Do not silently replace it with a familiar default.
2. Each selected stack specialist owns framework conventions, dependencies, configuration, and its listed checks. Apply its advice during setup, not only after errors.
3. OpenCode Build Agent implements the application and runs commands.
4. Build Doctor classifies failures and sends them back to the relevant specialist.
5. QA Agent verifies real browser behavior, accessibility, responsive layouts, data flows, console output, and production readiness.
6. Memory Agent records durable architecture and repair decisions under .nexus/memory.

Live browser intelligence packet:
Nexus available capabilities for chat/build routing:
- Browser Gatherer: rendered DOM, text, interactive elements, framework signals, storage keys, console, network/API signals, screenshots.
- Agent Browser: /agent-browser and /ab run Vercel agent-browser CLI/MCP commands; use for snapshots, refs, page reads, accessibility, vitals, React introspection, network tools, WebMCP, and natural-language browser control.
- Backend Observer: generated workspace package scripts, dependencies, API/server files, data models, env keys, build logs, and backend risks.
- OpenCode Builder: start builds, update active builds, run Build Doctor, auto-heal loops, snapshots, file locks, live preview, diff review, export ZIP.
- Research Project: crawl target pages, create project brain, UI intelligence, API/MCP discovery, SDK agents, build plan, scorecard, artifacts.
- QA: visual QA repair, side-by-side diff, staging studio, mobile/tablet/kiosk checks, SEO/security audit, browser shakedown.
- Integrations: GitHub Projects/issues, Vercel, Supabase, Stripe, SEO/security connectors, deploy panel, Git/Expo import.
- Providers and experts: 21 model/provider routes and 198 official-source language/stack experts.
Routing rule: answer questions with the best available evidence, ask for missing critical context only when needed, and for build requests combine browser evidence, Agent Browser observations, backend observations, OpenCode implementation, and QA verification.

---

Gatherer Agent live browser timeline:
2026-10-06T20:16:37.414Z Example Domain https://example.com/
Libraries: unknown; interactive elements: 1; network/API signals: 7; console errors: no

2026-10-06T20:16:47.414Z Example Domain https://example.com/
Libraries: unknown; interactive elements: 1; network/API signals: 7; console errors: no

2026-10-06T20:16:57.415Z Example Domain https://example.com/
Libraries: unknown; interactive elements: 1; network/API signals: 7; console errors: no

2026-10-06T20:17:07.419Z Example Domain https://example.com/
Libraries: unknown; interactive elements: 1; network/API signals: 7; console errors: no

2026-10-06T20:17:17.443Z Example Domain https://example.com/
Libraries: unknown; interactive elements: 1; network/API signals: 7; console errors: no

2026-10-06T20:17:21.544Z Example Domain https://example.com/
Libraries: unknown; interactive elements: 1; network/API signals: 7; console errors: no

2026-10-06T20:17:21.566Z Example Domain https://example.com/
Libraries: unknown; interactive elements: 0; network/API signals: 7; console errors: no

2026-10-06T20:17:21.576Z Example Domain https://example.com/
Libraries: unknown; interactive elements: 1; network/API signals: 7; console errors: no

Latest full observation:
Nexus native Chromium tab evidence:
Rendered page: Example Domain - https://example.com/
Viewport: {"width":1080,"height":848,"devicePixelRatio":2}
Visible controls: [{"tag":"a","text":"Learn more"}]
Visible text: This domain is for use in documentation examples without needing permission. This is not a service; avoid relying on it for testing and monitoring purposes. هذا النطاق مُخصص للاستخدام في أمثلة التوثيق دون الحاجة إلى إذن. هذه ليست خدمة، يُرجى تجنب الاعتماد عليها لأغراض الاختبار والمراقبة. 该域名仅用于文档示例，无需获得许可。这并非一项服务，请勿将其用于测试和监控目的。 L’usage de ce domaine est réservé à des exemples de documentation, sans autorisation préalable. Il ne s’agit pas d’un service ; son utilisation à des fins de test ou de surveillance est à éviter. Данный домен предназначен для использования в примерах документации без необходимости получения предварительного разрешения. Это не сервис; не рекомендуется его использование для тестирования и мониторинга. Este dominio está destinado al uso en ejemplos de documentación sin necesidad de permiso. Esto no es un servicio; evitar utilizarlo para realizar pruebas o monitoreos. Learn more
Recent console: ["Custom state pseudo classes are changing from \":--aim-input-plate-anchor\" to \":state(aim-input-plate-anchor)\" soon. See more here: https://github.com/w3c/csswg-drafts/issues/4805 (https://www.google.com/xjs/_/js/k=xjs.s.en.BfFbpkQV9-k.2023.O/am=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAIAIAAQAgAQACAAAAAAAAAAAAAAAAAAAAAAAAAAgABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABBAIASABAAAAAAAAAAAgQAAAABAAAAAAAAAAAADABAAAAGgBAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAIIEAAAAAgAgEAAAEAAPxjzDcAAGgAAAAAAAASAAAAAAAAAAAAAAAAAAAAAAAAAEACAAAAAAAAAACABQAAAAABBgAAEAACCIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAABAAQAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAABAAAAAAKAAAAAAAAAADAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAABBgAAAAAAAAAAAAACgACP4AgAAEAAAAAAAgAAAAAAAAAAAAAEoAAAAAAAAAAAAQAADAAAAAAcgA8HoBDBAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAIgAKYA0lBAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBFeAoAAAAAAABsDQAE/d=1/ed=1/dg=4/br=1/ichc=1/rs=ACT90oHguLOnI0HY6OJuCd5blyZ-G4SKyg/ee=ALeJib:B8gLwd;AfeaP:TkrAjf;BMxAGc:E5bFse;BgS6mb:fidj5d;BjwMce:cXX2Wb;BuJtU:v6yjN;CIZTGb:Kqhykb;CxXAWb:YyRLvc;DM55c:imLrKe;DQEued:Fevhcf;DULqB:RKfG5c;Dkk6ge:JZmW9e;DpcR3d:zL72xf;EABSZ:MXZt9d;ESrPQc:mNTJvc;EVNhjf:pw70Gc;EjXHpb:pSHqh;EmZ2Bf:zr1jrb;EnlcNd:WeHg4;F54IAe:ZgsFh;F9mqte:UoRcbe;FSxmUe:fiZR8b;Fkukfc:i8H2c;Fmv9Nc:O1Tzwc;FqHJkd:yQamIb;G0KhTb:LIaoZ;GleZL:J1A7Od;HMDDWe:G8QUdb;HtPxrd:Gx8jAb;IBADCc:RYquRb;IoGlCf:b5lhvb;IsdWVc:qzxzOb;JXJSm:ii1RGf;JXS8fb:Qj0suc;JqSq7d:y9ePhe;JsbNhc:Xd8iUd;K08hxe:zmbGlf;K5nYTd:ZDZcre;KA3P2:C3JnCe;KDb6nb:fE9n2;KOxcK:OZqGte;KQzWid:ZMKkN;KdIHef:BWtNj;KpRAue:Tia57b;LBgRLc:SdcwHb,XVMNvd;LBn8Cf:bJ9L0c;LEikZe:byfTOb,lsjVmc;LXA8b:q7OdKd;LsNahb:ucGLNb;MNkAde:KMCd1d;NJ1rfe:qTnoBf;NPKaK:SdcwHb;NSEoX:lazG7b;NjIwef:YVgi7d;Np8Qkd:Dpx6qc;Nyt6ic:jn2sGd;OIfWUb:qfOYcd;OgagBe:cNTe0;OiqE2c:TFpEK;OoK5v:Sp69O;OohIYe:mpEAQb;Pjplud:PoEs9b;PpTLXd:pJYjx;PqHfGe:im2cZe;Q1Ow7b:x5CSu;Q7iJ9c:bVLZ3d;QE20Be:yxCHBd;QFOGlf:PQ2Aoe;QGR0gd:Mlhmy;QYLF2b:pAQYUd;Qk7yid:BbYS0d;Qw8Feb:jpavUe;R4IIIb:QWfeKf;R9Ulx:CR7Ufe;RCF5Sd:X1kBmd;RZKicf:PQXVv;RZtOEd:DvKcFe;Raf5me:mgvFMc;SFghJd:YRZpK;SLtqO:Kh1xYe;SMDL4c:fTfGO;SNUn3:ZwDk9d,xD8Kp;SNk4Je:wWMhg;ScI3Yc:e7Hzgb,e7Hzgb;ShpF6e:N0pvGc;Snahre:mGCtob;SzQQ3e:dNhofb;TIUVQd:lWTJwd;TroZ1d:vVVzjb;U96pRd:FsR04;UBKJZ:LGDJGb;UDrY1c:N0F29d,W50NVd,eps46d,wciyUe;UVmjEd:EesRsb;UVzb9c:IvPZ6d;UYRIEb:HzTAQc;UyG7Kb:wQd0G;V2HTTe:RolTY;VGRfx:VFqbr;VMuEm:pL7sBc;VN6jIc:ddQyuf;VOcgDe:YquhTb;VhA7bd:vAmQFf;VsAqSb:PGf2Re;W9QSQe:ynCWwc;WDGyFe:jcVOxd;WXtNeb:QU9BMd;Wfmdue:g3MJlb;Wl55ib:NcYlP;Y3c5sd:FGbfLe;YIZmRd:A1yn5d;YV5bee:IvPZ6d;YnHUBf:sNsSob;ZMvdv:PHFPjb;ZSH6tc:QAvyLe;ZWEUA:afR4Cf;Zen4yb:jMF88c;ZlFEdf:fQTtic;ZlOOMb:P0I0Ec;ZnPvub:Acmyhd;a56pNe:JEfCwb;aAJE9c:WHW6Ef;aCJ9tf:qKftvc;aVZq3e:EMeVIb;aZ61od:arTwJ;aci7y:Z5Tr6c;bUIkwb:WMwEHe;bcPXSc:gSZLJb;cEt90b:ws9Tlc;cFTWae:gT8qnd;coJ8e:KvoW8;dIoSBb:ZgGg9b;dLlj2:Qqt3Gf;dXdZV:a7QTqd;dowIGb:ebZ3mb,ebZ3mb;dtl0hd:lLQWFe;eBAeSb:Ck63tb;eBZ5Nd:audvde;eHDfl:ofjVkb;eJKchc:ATg1be;eO3lse:UefOmb;euOXY:OZjbQ;g8nkx:U4MzKc;gaub4:TN6bMe;gbfHR:qZtzib;gtVSi:ekUOYd;h3MYod:ws9Tlc;hK67qb:QWEO5b;hVic1b:Kqhykb;heHB1:sFczq;hjRo6e:F62sG;hlqGX:FWz1ic;hsLsYc:Vl118;hwoVHd:zw4U8c;iFQyKf:QIhFr;jJj2G:kF2o2b;k1O0rf:pnOULd;k2Qxcb:XY51pe;kbAm9d:MkHyGd;lOO0Vd:OTA3Ae;lbfkyf:MqGdUd;liAz7d:kF2o2b;lkq0A:JyBE3e;mMVOGb:qDM7K;mWzs9c:fz5ukf;mtKMCc:ZG5Tfe;nBZnZe:CvErjb;nE6OJf:Fi4rsc;nEBWNb:MxKX9d;nJw4Gd:dPFZH;nrDcw:SuEoDe;oGtAuc:sOXFj;oSUNyd:fTfGO,fTfGO;oUlnpc:RagDlc;oiBhre:OuMkRd;okUaUd:wItadb;pKJiXd:VCenhc;pNsl2d:j9Yuyc;pXdRYb:JKoKVe;pj82le:ww04Df;qGV2uc:HHi04c;qQEoOc:KUM7Z,d7YSfd;qZx2Fc:j0xrE;qaS3gd:yiLg6e;qafBPd:sgY6Zb;qavrXe:I0C9u;qddgKe:d7YSfd,x4FYXe;rdexKf:FEkKD;rmWaj:PMS6Sd;ropkZ:hjoqoe;sTsDMc:JksfDf;sZmdvc:rdGEfc;tH4IIe:Ymry6;teSRSb:BMLai;tosKvd:ZCqP3;trZL0b:qY8PFe;twgzJd:Ix7YEd;uJfyCe:WJ5gBc;uknmt:GkPrzb;uuQkY:u2V3ud;vEYCNb:FaqsVd;vRlMvf:Iw9Xo;vfVwPd:lcrkwe;w3bZCb:ZPGaIb;w9w86d:XwhUEb,dt4g2b,gKD90c,lWVZVe;wFpbG:JbGbBc;wQlYve:aLUfP;wR5FRb:O1Gjze,TtcOte;wV5Pjc:L8KGxe;wxAT5b:tHKmqf;x9N9ie:KH4Qof;xBbsrc:NEW1Qc;xbe2wc:wbTLEd;xpaRob:AVqZ9b;yiL5Ab:MT0ZBd;ysNiMc:CpIBjd;yxTchf:KUM7Z;z97YGf:oug9te;zaIgPb:Sl0pxd/cb=loaded_h_0/m=X3N0Bf,attn,cdos,gwc,hsm,jsa,mb4ZUb,cEt90b,SNUn3,qddgKe,sTsDMc,dtl0hd,eHDfl,YV5bee,d,csi?cb=121509378:313)"]
Recent network: [{"url":"https://pagead2.googlesyndication.com/bg/M6MJgqwIMrjVelT2LmnVrpp5ruldAuIVrS8ns69K1Yo.js","method":"GET","status":200,"error":"net::OK"},{"url":"https://www.google.com/xjs/_/ss/k=xjs.s.A5n-3MkWrO0.L.B1.O/am=CAAIAAAAAAAAAQAAAAAAAAAAAIAAAUQAAAAAAAAAAAAAAAAAAABACAAEAABAAAAAAAAAAAAAAAAAAAAAAAIAAQAAAAAAAAAAAAAAAACCGAAAAAAAAAAoAAAAAACEAGhABABAAAAAAAAAAAAACj0AAABgAAAAAAAAgAcwAHARAAAAAAAAAAAABAAAAAAAIACABAAAAAAAAAAAgQAABAAAAAAAAAEAAAAAABAAAAGgAAAAAAgAAAAAAgAAAAACAAAAAAAAAAAIDEAEAAAAAAAAABEAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAkAAAAAAAAAAAAAAAAgOAAAAAAAAIIBAAAAABgAAAAAEAAACAAAAAAAAAAAAACEBEgAAAQAAAAAAAwAAAAAAAAAAAAAAAGAEAoBAAFAAQi4IgAAAAAcABAAAAAAAABoICABAAAAAAAAEAAAAABAAABBAEIAAQAAABAAAAAAAAABAAAAABADAAAAAAAAAAigAAhAAAAjSAAAJAoJASIAAAIAABAAACAAEQAAAAAAChAQAAAAAAAAAAAAAIgAAAAAAAAAAAAAAAAAAAAAAEsAgAUEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE/d=0/br=1/rs=ACT90oHXXZn4AAmSMDTJtnFe9UyOXYTdyQ/cb=loaded_h_0/m=sy24p,sy245,sy25n,sy25p,sy1qf,sy25m,sy246,sy247,sy25o,sy25j,sy25i,sy25h,sy24m,sy24s,sy24k,sy25g,sy25e,sy25d,sy258,sy24u,sy24j,sy24g,sy24f,sy24b,sy230","method":"GET","status":200,"error":"net::OK"},{"url":"https://www.google.com/xjs/_/js/k=xjs.s.en.BfFbpkQV9-k.2023.O/am=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAIAIAAQAgAQACAAAAAAAAAAAAAAAAAAAAAAAAAAgABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABBAAASABAAAAAAAAAAAgQAAAABAAAAAAAAAAAADABAAAAEgBAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAIIEAAAAAgAgEAAAEAAPxjzDcAAGgAAAAAAAASAAAAAAAAAAAAAAAAAAAAAAAAAEACAAAAAAAAAACABQAAAAABBgAAEAACCIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAABAAQAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAABAAAAAAKAAAAAAAAAADAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAABBgAAAAAAAAAAAAACgACP4AgAAEAAAAAAAgAAAAAAAAAAAAAEoAAAAAAAAAAAAQAADAAAAAAcgA8HoBDBAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAIgAKYA0lAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBFeAoAAAAAAABsDQAE/d=0/dg=0/br=1/rs=ACT90oEhBvmFn8jK5FzDJYR4Yss6I_tSJQ/cb=loaded_h_0/m=sy22e,sy22b,gllL8,sy20s,qj9t6b,sy1z6,flOtPc,WPBHX,sy21f,sy21e,sy21a,sy218,sy1zo,sy216,sy20x,sy1zr,sy20g,sy20h,sy1zt,sy1zs,sy1zp,bFudd,sy20d,sy20e,sy20b,sy20a,sy20c,sy209,WlOj5b,TZ9Mbe,q4TQy,QU9BMd,WXtNeb,sy1z4,sy1z3,VZ6ki,sy26d,sy26b,sy268,sy267,sy265,sy21h,sy21p,sy21i,sy24e,sy21t,sy21r,sy263,sy262,sy24q,sy21s,sy24p,sy24l,sy261,sy260,sy25z,sy25y,sy21g,sy21j,sy24i,sy24h,sy245,sy21x,sy25n,sy25w,sy25v,sy25u,sy25t,sy25r,sy25f,sy24a,sy248,sy22z,sy21o,sy25p,sy24o,sy21u,sy1qf,sy25m,sy21q,sy25k,sy246,sy247,sy25o,sy25x,sy25j,sy25i,sy25h,sy24r,sy21n,sy24n,sy24m,sy24s,sy24k,sy25g,sy25e,sy24t,sy25d,sy259,sy231,sy258,sy256,sy255,sy254,sy253,sy252,sy251,sy250,sy24z,sy24y,sy24x,sy24w,sy24v,sy24u,sy24j,sy257,sy24g,sy24f,sy242,sy24b,sy241,sy240,sy23z,sy230,sy21y,sy23q,sy266,uxlhU","method":"GET","status":200,"error":"net::OK"},{"url":"https://ep2.adtrafficquality.google/generate_204","method":"GET","status":204,"error":"net::OK"},{"url":"https://example.com/","method":"GET","status":200,"error":"net::OK"},{"url":"https://www.google.com/xjs/_/js/k=xjs.s.en.BfFbpkQV9-k.2023.O/am=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAIAIAAQAgAQACAAAAAAAAAAAAAAAAAAAAAAAAAAgABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABBAAASABAAAAAAAAAAAgQAAAABAAAAAAAAAAAADABAAAAEgBAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAIIEAAAAAgAgEAAAEAAPxjzDcAAGgAAAAAAAASAAAAAAAAAAAAAAAAAAAAAAAAAEACAAAAAAAAAACABQAAAAABBgAAEAACCIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAABAAQAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAABAAAAAAKAAAAAAAAAADAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAABBgAAAAAAAAAAAAACgACP4AgAAEAAAAAAAgAAAAAAAAAAAAAEoAAAAAAAAAAAAQAADAAAAAAcgA8HoBDBAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAIgAKYA0lAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBFeAoAAAAAAABsDQAE/d=0/dg=0/br=1/rs=ACT90oEhBvmFn8jK5FzDJYR4Yss6I_tSJQ/cb=loaded_h_0/m=nHLHI","method":"GET","status":200,"error":"net::OK"},{"url":"https://example.com/s.js","method":"GET","status":200,"error":"net::OK"}]

---

Backend Observer has no active generated workspace yet. Start or select a build to inspect server/API/data functionality.

---

Agent Browser has no CLI/MCP observations yet. Use /agent-browser open, /agent-browser snapshot, or /agent-browser chat to add evidence.

---

Active build id: none

---

Project readiness / smart setup:
Type: content-marketing
Stack signals: react, node-api, supabase, stripe, github, mobile, ai, vercel
Feature signals: content
Answered setup signals: pages
Clarification needed: yes
Questions to ask before build:
1. Who is this for and what outcome should they get first?
2. What should the visual style/brand feel like, or should Nexus invent a creative direction?
3. Should Nexus clone/reference a URL, search for examples, or invent from scratch?
Smart-default policy: unresolved low-risk questions are not blockers. Prefer reversible local/mock defaults, document assumptions, and produce the first working product slice quickly.
Recommended setup:
- Create project brain from chat plus browser/Agent Browser evidence
- Generate OpenCode task plan before file edits
- Run Build Doctor after dependency install/build
Recommended staging devices: desktop, tablet, mobile

---

Recent conversation knowledge (requirements and decisions are cumulative):
user: give me apis

assistant: Nexus received: give me apis

Mode: build | UI: faithful-clone
Browser evidence: ready | Backend workspace: not started yet

I will route this to OpenCode, then bring up the preview and browser QA.

Cloud AI is not configured, so Nexus is using built-in planning plus OpenCode as the code executor. Builds will still create an OpenCode prompt/workspace and run `opencode run` when available.

Autonomous runtime: Applied runtime skills: Stack Expert Routing, Autonomous Vibe Coding Browser Loop, Intent To Product Sprint.

Smart route: Memory And Skills | knowledge: 5 skills, 2 relevant memories.

user: build bike week landing page

---

Active project knowledge: no active build yet.

---

Nexus Native Agent Runtime:
Persistent memories: 45
Reusable skills: 6
Delegation runs: 0
Enabled recurring jobs: 0

Relevant memory:
- User asked: build landing page for daytona bike week
Mode: build
Active build: none [builder-chat, build]
- User asked: build a bike week landing page
Mode: build
Active build: none [builder-chat, build]
- User asked: daytona bike week landing page
Mode: ui-builder
Active build: none [builder-chat, ui-builder]
- User asked: bike landing page
Mode: build
Active build: none [builder-chat, build]
- User asked: bike landing page
Mode: build
Active build: none [builder-chat, build]
- User asked: bike landing page
Mode: build
Active build: none [builder-chat, build]
- User asked: bike landing page
Mode: build
Active build: none [builder-chat, build]
- User asked: bike landing page
Mode: ui-builder
Active build: 4126306b [builder-chat, ui-builder, active-build]

Relevant skills:
- Autonomous Vibe Coding Browser Loop: Use when chat asks Nexus to build, clone, repair, improve, debug, automate, or act autonomously.; steps=Capture live browser evidence: page, DOM, styles, console, network, storage, screenshots, and responsive state. -> Classify the work: research, plan, build, update, repair, integration, QA, deploy, or recurring operation. -> Delegate to specialist agents when parallel research, coding, backend mapping, QA, or memory work helps. -> Start or update OpenCode with browser/backend/runtime context, then verify with preview, Build Doctor, and visual QA.
- Intent To Product Sprint: Use for build, create, app, website, dashboard, portal, landing page, prototype, or product requests.; steps=Infer the product type, audience, primary outcome, and smallest complete workflow from the prompt and chat history. -> Use reversible smart defaults for unspecified style, data, auth, and content instead of blocking the first build. -> Build the primary user journey first, including loading, empty, error, mobile, and accessibility states. -> Return a running preview quickly, then refine from browser evidence and user feedback.
- Stack Expert Routing: Use for PHP, Laravel, React, Vite, Next.js, Vue, Python, APIs, databases, auth, payments, mobile, and build failures.; steps=Detect the requested stack from the prompt, active project files, dependencies, logs, and browser signals. -> Keep the existing stack for updates unless the user explicitly requests a migration. -> Route setup and failures to matching official-source experts and their stack-specific verification commands. -> Keep the team small enough to avoid duplicated work and conflicting changes.
- Focused Repair And QA Loop: Use for fix, repair, debug, broken, error, failing, Build Doctor, auto heal, test, QA, or deploy readiness.; steps=Classify the failure as requirements, dependency, compiler, framework, runtime, API, data, browser, or deployment. -> Select the matching expert and preserve a snapshot or clear rollback path before risky edits. -> Apply the smallest root-cause fix and run focused checks before broad verification. -> Persist the failure signature, fix, and verification result for future chats.

Recurring jobs:
- none yet

---

Nexus smart chat orchestration plan:
Intent: build
Stack: React + Vite / TypeScript / npm
Selected agents:
- Memory And Skills Agent: recall requirements and preserve durable decisions
- Creative Mind Builder: create a product-specific visual direction
- Full-Stack Expert Router: select current stack specialists and checks
- OpenCode Build Agent: implement and verify the requested code
- Build Doctor Agent: diagnose setup, build, runtime, and preview failures
- QA Agent: verify browser behavior, accessibility, and regressions
- React Agent: Create React pages, hooks, providers, routing, state, loading/error states, and UI/API wiring.
- Browser UI Agent: translate rendered browser evidence into UI decisions
Selected official-source experts: TypeScript Expert Agent, React Expert Agent, Vite Expert Agent, Node.js Runtime Expert Agent, npm Expert Agent, Accessibility/WCAG Expert Agent, Playwright Expert Agent, OWASP AppSec Expert Agent
Applied reusable skills: Autonomous Vibe Coding Browser Loop, Intent To Product Sprint, Stack Expert Routing, Focused Repair And QA Loop
Evidence sources: live browser and DevTools evidence, Agent Browser observations, runtime memory, recent chat requirements
Relevant runtime memory:
- User asked: build landing page for daytona bike week
Mode: build
Active build: none
- User asked: build a bike week landing page
Mode: build
Active build: none
- User asked: daytona bike week landing page
Mode: ui-builder
Active build: none
- User asked: bike landing page
Mode: build
Active build: none
- User asked: bike landing page
Mode: build
Active build: none
- User asked: bike landing page
Mode: build
Active build: none
Relevant project knowledge:
- none
Execution path:
1. Use the captured browser evidence
2. Apply selected skills and stack experts
3. Build the smallest complete product slice
4. Run build and browser QA
5. Persist verified decisions
Execution rule: use this focused team automatically. Do not ask the user to choose agents or restate context that is already known.

Shared Nexus agent knowledge to apply:
- NexusBrowser advantage: treat the browser as the development brain, not just a preview. Use live pages, screenshots, DOM, computed styles, console logs, network traffic, storage, cookies, API discovery, accessibility signals, and visual QA as evidence for every coding decision.
- Backend Observer advantage: infer hidden functionality from package scripts, dependencies, server files, API routes, data models, env keys, logs, request/response shapes, auth/session flows, webhooks, and background jobs so the duplicated app works like the original, not just looks like it.
- Developer employee model: package expert agents as hireable/schedulable dev employees with clear jobs, triggers, integrations, outputs, run history, cost/risk controls, and human approval gates for risky actions.
- Senior software engineering: requirements analysis, architecture tradeoffs, code review, refactoring, debugging, testing strategy, observability, maintainability, and delivery planning.
- Full-stack web: TypeScript, JavaScript, React, Next.js, Vite, Node.js, Express, REST, GraphQL, WebSockets, auth, payments, email, storage, background jobs, caching, and API design.
- System engineering: operating systems, shells, filesystems, networking, DNS, HTTP/TLS, reverse proxies, containers, CI/CD, cloud deployment, secrets, logs, metrics, tracing, backups, and incident response.
- Data engineering: SQL, schema design, migrations, indexes, transactions, SQLite, Postgres, Prisma, Drizzle, Redis-style caching, search, analytics, seed data, and local-first sync patterns.
- Frontend craft: accessibility, semantic HTML, responsive layouts, component systems, state machines, forms, validation, loading/empty/error states, performance, browser APIs, and progressive enhancement.
- Real rendering and device QA: verify apps as real websites across desktop, tablet, mobile touch emulation, kiosk/fullscreen, app-store screenshot sizes, game/canvas viewports, reduced-motion, offline/slow-network, and authenticated states.
- Graphic and product design: hierarchy, typography, color theory, spacing, grids, contrast, brand systems, iconography, motion, composition, information architecture, usability, and non-template visual direction.
- Security and privacy: OWASP risks, input validation, auth/session safety, least privilege, dependency risk, env handling, secret redaction, safe tool execution, and user-approval boundaries.
- Quality loops: run focused tests, build verification, browser QA, visual regression checks, accessibility checks, performance checks, and root-cause repair instead of cosmetic fixes.

Build a real working React + Vite application, not notes or a mock plan. Use the generated files as a starting point, but replace placeholders and incomplete scaffolding. Use production-quality styling, responsive layout, accessible components, and a maintainable project structure appropriate to TypeScript.

NexusBrowser advantage to design around:
- Use the browser as evidence: reference page, live preview, DOM, styles, screenshots, console, network, storage, and API discovery inform code changes.
- Use DevTools evidence internally to improve the requested product. Do not put Nexus development controls or AI marketing into the user product.
- Implement the end user workflows requested by the user, independently of Nexus development tools.

Required work:
- Inspect the current files, stack plan, and expert manifest first.
- Set up React + Vite using its normal directory layout, dependency manager, configuration, environment conventions, and security practices.
- Do not introduce React, Vite, npm, PHP, Composer, or any other stack unless it is in the plan or genuinely required by the request.
- Implement the complete user-facing and backend behavior implied by the request.
- Run setup only as needed: npm install.
- Verify with: npm run build; npm test -- --runInBand. Fix failures before finishing.
- Confirm the development command works: npm run dev -- --host 0.0.0.0 --port {port}.
- Add clear README usage instructions for the actual stack.
- Do not hardcode secrets; create .env.example when configuration is required.
- Include realistic data/state, responsive mobile behavior, empty/loading/error states, accessible focus paths, and one distinctive interaction or visual system that fits the product.
- Add a short QA checklist covering desktop, mobile, console/runtime errors, API/data flows, and the stack-specific production check.
- Avoid generic centered hero plus three cards unless the product specifically calls for it; make layout, typography, color, and component rhythm product-specific.
