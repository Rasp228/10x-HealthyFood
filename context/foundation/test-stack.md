# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.63.0
- config: playwright.config.ts
- single-spec command: npm run test:e2e -- tests/e2e/<name>.spec.ts (sets TEST_MODE=true, which loads .env.test; plain `npx playwright test` throws in the env guard)
- full-suite command: npm run test:e2e
- base URL: http://localhost:3100
- port: 3100 (E2E_PORT from .env.test — 3000 is taken by Docker on this machine); detected default 3000 from astro.config.mjs server.port, override with E2E_PORT
- web server command: npm run dev:e2e -- --port ${E2E_PORT} --ignore-lock (dev server, not build + preview: @astrojs/vercel has no preview entrypoint; --ignore-lock is load-bearing, see docs/reference/contract-surfaces.md); reuseExistingServer: true (also in CI)
- auth setup project: setup (tests/e2e/auth.setup.ts), credentials from E2E_USERNAME / E2E_PASSWORD in .env.test (remote Supabase `integration` project; user already existed); session-boundaries.spec.ts runs without the session in project `chromium-logout`, after `chromium`, because its logout is global
- storageState: playwright/.auth/user.json (gitignored), loaded by project `chromium`
- seed: tests/e2e/seed.spec.ts — protects #3 (signed-in session survives requests: /diary opens and stays open after reload, no redirect to /auth/login)
- browser CLI: playwright-cli 0.1.22 (global), command skill at .claude/skills/playwright-cli/SKILL.md; use -s=szkolenie
- updated: 2026-10-09
