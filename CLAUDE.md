<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 5, Lesson 2 (Team Agent with SDKs)

Build a minimal code-review agent: diff in, structured JSON verdict out. The schema and system prompt are the contract everything later (CI gate, evals) depends on.

```
review schema + system prompt -> review.ts (ready-made agent SDK or AI SDK ToolLoopAgent) -> git diff | npx tsx review.ts
```

### Task Router - Where to start

| Skill / prompt / template | Use it when |
| --- | --- |
| `m5l2-review-schema.ts.template` (config templates) | Starting the reviewer. Copy it into your reviewer package: six scored criteria (1-10), verdict and summary as a zod schema plus the system prompt. |
| `m5l2-agent` (prompts) | Setting up the AI SDK entry point and then planning a modular `ToolLoopAgent` reviewer with `/10x-plan`. |
| `/10x-plan` -> `/10x-implement` | Turning the single-file reviewer into reusable modules. |

### Hard rules

- **The schema is the contract.** Change criteria, verdict values or field names in the schema first, then in prompts, gates and evals.
- **Pin major versions.** The lesson code targets AI SDK 7 (`ai@7`, `@openrouter/ai-sdk-provider@3`) and Node 22+.
- **Track cost per run.** Log usage from every review and set a hard budget cap before the agent runs unattended.

<!-- END @przeprogramowani/10x-cli -->

---

# 10x-HealthyFood — project conventions

@AGENTS.md is the single source of truth for this project's conventions — read it and edit it
there, not here. This section is project-owned and sits **outside** the `@przeprogramowani/10x-cli`
markers above, so it survives toolkit syncs.
