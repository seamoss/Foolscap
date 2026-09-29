# Contributing

Thanks for even reading this. The rules are short.

## Found a bug?

**Report it.** [Open an issue](https://github.com/seamoss/Foolscap/issues)
with your macOS version, your Foolscap version, and the smallest markdown
file that reproduces it. A bug is a crash, lost or mangled text, a wrong
render, a shortcut that doesn't. Anything that breaks the one promise —
*the file on disk is byte-for-byte what you wrote* — jumps the queue.

Bug-fix PRs are welcome too, and they come with the test that would have
caught the bug — written first, failing before the fix. Which kind of test
depends on what the fix touches, and [docs/adr/0001-testing.md](docs/adr/0001-testing.md)
decides that from your diff: a unit test for a pure module, a golden
fixture for the markdown pipeline (if export output changes by a byte, the
change is wrong), or an end-to-end case in `scripts/e2e/cases` for the
renderer's `main.ts`, the main process's `session.ts`, and the other files
the ADR lists. Keep `pnpm typecheck`, `pnpm test`, and (for that last
group) `pnpm e2e` green. The PR template asks which layer you chose.

## Have a feature request?

I won't focus on it, and that's a promise, not a backlog. Foolscap's
feature set is deliberately closed — the [out of scope list](README.md#out-of-scope)
is load-bearing, and "small addition" is how every beloved tool became a
dashboard. Feature issues and feature PRs will be closed with affection.

**Fork it and build it.** That's not a brush-off — it's the license. MIT
means the app you're imagining is one `git clone` away, and I genuinely
hope it turns out great.
