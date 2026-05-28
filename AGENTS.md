# Agent Notes

## Type Checking

`lsp_diagnostics` is slow. Don't use it for fast iteration.

Use instead:

```zsh
pnpm check
```

Runs `tsc --noEmit`. Fast, reliable. Run after changes to verify types.

## Dev server

```zsh
pnpm dev
```

Starts Next.js on port 9091. `instrumentation.ts` fires probe startup automatically.
