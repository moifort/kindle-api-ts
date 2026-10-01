# kindle-api-ts

- Type-check `bun tsc --noEmit`, tests `bun test`, lint `bunx biome check`, build `bun run build`.
- Runtime: always `bun` / `bunx`, never `npm` / `npx`.
- No `for` / `while` loops: `map` / `filter` / `flatMap`, recursion for pagination.
- Unit tests only (`*.unit.test.ts`), with `fetch` replaced: nothing here may reach Amazon in CI.
- Changing the public API means updating `README.md`.
