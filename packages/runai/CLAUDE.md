---
description: Use pnpm for package management in runai.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Use pnpm for dependency installation and package scripts in this package.

- Use `pnpm install` from the workspace root.
- Use `pnpm --filter runai <script>` when invoking runai scripts from the root.
- Do not add npm, Yarn, or Bun lockfiles.
- Avoid `npm`, `yarn`, `npx`, `bun install`, and `bun run` for package management.

## APIs

The CLI still targets the Bun runtime in implementation code. Keep runtime APIs such as
`Bun.spawn` or `bun:sqlite` unless the task is explicitly to migrate runai off Bun.

## Testing

Use `pnpm test` or `pnpm --filter runai test` to run tests.

```ts#index.test.ts
import { expect, test } from "vitest";

test("hello world", () => {
  expect(1).toBe(1);
});
```
