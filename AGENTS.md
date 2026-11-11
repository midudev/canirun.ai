# AGENTS.md

Instructions for agents working in this repository.

## Automatic checks

**Do not run typechecking or linters unless you are explicitly asked to.**

That includes, among others:

- `pnpm astro check` / `astro check`
- `tsc`, `tsc --noEmit`, `pnpm packages:typecheck`
- `eslint`, `pnpm lint`, or any other lint command
- `pnpm test` / `vitest` unless explicitly requested

Reason: these commands are slow in this project and rarely tell the agent anything that `ReadLints` on the edited files would not. Trust `ReadLints` and manual inspection unless the user asks otherwise.

If the user says something like "check types", "run the typecheck", "run the tests", "lint the project", or equivalent, then you should run them.

## Package manager

Always use `pnpm` unless a `bun.lock` exists in the subpackage (then use `bun`). Never `npm`.

## Model catalog: official sources only

**NEVER add a model that does not come from its official publisher.** Third-party uploads are dangerous: they can ship modified or malicious weights under a trusted name.

When adding or editing a model in `packages/models/src/index.ts`:

- `url` must point to the publisher's own organization (for example `Qwen/…`, `google/…`, `prism-ml/…`), never to a community mirror or re-upload.
- `ollamaId` must be an entry in the official Ollama library or in the publisher's own Ollama namespace. If neither exists, leave it out.
- `ggufRepo` and `lmStudioId` follow the same rule: use the publisher's repository when one exists.
- Check that every repository and id actually exists before adding it.
- If a contribution only offers a community upload, find the official source or do not add the model.
