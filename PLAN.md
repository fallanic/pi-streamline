# pi-opencode-ui — plan

Goal: make Pi's TUI behave like opencode's — while tools/subagents run, show a **single live status line**, and in the transcript show **one compact row per tool call**, with full output only on expand. No wall of text.

Repo layout (future): `extensions/opencode-ui/index.ts` + a few sibling modules, `package.json` with `pi.extensions`.

Decisions already made: **no zentui** (confirmed not installed in this environment), **detect-and-no-op on any patch seam that is missing**, **subagent rows are configured, not reimplemented**.

---

## 1. What "the opencode look" actually is (from source)

`opencode/packages/tui/src/routes/session/index.tsx`:

- **Subagent/task tool → two lines, no body** (`routes/session/index.tsx:2260-2295`):
  ```
  │ General  fix the parser
  │ ↳ Read  src/parser.ts
  ```
  While running, the second line is the *current inner tool* (`tools().findLast(...)`, line 2238). When finished it becomes a summary: `↳ 12 tools · 34s`.
- **Output is collapsed by default** — `util/collapse-tool-output.ts`: `maxLines` (4 for tool rows, line 2351) and `maxChars` scaled to terminal width, trailing `…`.
- **No background band.** Plain styled rows with a `✓` / `│` / `✗` icon and a spinner while running.

Contrast with Pi today: each `ToolExecutionComponent` wraps content in a `Box` with `theme.bg("toolPendingBg" | "toolSuccessBg" | "toolErrorBg", …)` — a full-width colored band per call — plus a 10-line raw output preview (`FALLBACK_PREVIEW_LINES = 10`).

## 2. What Pi already gives us (verified against installed pi 0.87.1)

| Lever | API | Patch required? |
|---|---|---|
| Live "current tool" line | `ctx.ui.setWorkingMessage()`, `setWorkingIndicator({frames})`, `setStatus(key, text)`, `setWidget()` (`core/extensions/types.d.ts:81-99`) | **No** |
| Tool lifecycle events | `pi.on("tool_execution_start" \| "tool_execution_end")` → `{toolCallId, toolName, args}` / `{…, result, isError}` | **No** |
| Compact transcript row | *no public factory*; `ToolExecutionComponent` is constructed directly in `modes/interactive/interactive-mode.js:1629` | **Yes** — but the class *is* a public export (`dist/index.d.ts:29`) |
| Subagent rows | `subagent` already ships `renderCall` + `renderResult`, configurable | **No** — config only |
| Dive into a subagent | `/subagents-fleet` (pi-subagents): live inspector with foreground work, async children, Markdown/tool transcripts, session paths (`pi-subagents/docs/observability.md:104`) | **No** — already exists |
| Reveal detail | click toggles `setExpanded` (`components/tool-execution.js:107-114`), `ctx.ui.getToolsExpanded()/setToolsExpanded()`, keybinding `app.tools.expand` | **No** |
| Our own tools | `pi.registerTool({renderCall, renderResult, renderShell})` | **No** |

So: **one small prototype patch + one status-line component + a config block.**

## 3. Design

### Layer 1 — live status line (public API, no patch)

Subscribe to `tool_execution_start` / `tool_execution_end`, keep a `Map<toolCallId, {name, args, t0}>`.

- `setWorkingMessage("Read  src/parser.ts")` while a single tool runs.
- With parallel calls: `Read  src/parser.ts +2 more` (in-flight count).
- `setWorkingMessage()` with no arg restores Pi's default; clear the status key on `agent_settled` / `session_shutdown`.
- Durations are computed on end and rendered into the transcript row, not the live line.
- Guard with `ctx.mode === "tui"` and `ctx.hasUI` so JSON/print/RPC modes stay clean.

This is the part that degrades gracefully, and it removes most of the "what is it doing" noise on its own.

### Layer 2 — compact transcript row (the one patch)

Seam: `ToolExecutionComponent.prototype`. Three private methods decide the entire look and all three read `this.toolDefinition`:

```ts
getRenderShell()    { return this.toolDefinition?.renderShell ?? "default"; }  // "self" ⇒ no Box/bg band
getCallRenderer()   { return this.toolDefinition?.renderCall; }
getResultRenderer() { return this.toolDefinition?.renderResult; }
```

Install on `session_start`, uninstall on `session_shutdown`, idempotently:

1. Wrap `getRenderShell` → return `"self"`. **This is the whole visual fix**: content renders into `selfRenderContainer` with no `Box`, so the `tool*Bg` bands disappear.
2. Wrap `getCallRenderer` / `getResultRenderer` → return our renderer **only** for tool names in our table *and only when the tool has no `renderResult` of its own*. `subagent` and every other extension tool keeps its own renderer untouched.

With `renderShell: "self"` the component forwards mouse events into our subtree (`handleMouse`, `tool-execution.js:210-220`), so click-to-expand keeps working.

Our renderer produces a `Text` (or a small `VStack`) from `@earendil-works/pi-tui`:

- collapsed: `● Read   src/parser.ts            42 lines · 120ms`
- expanded: collapsed row + the **predecessor's** result renderer output — nothing is lost, no reimplementation of diff/markdown rendering
- unknown tool: `● <toolName>  <one-line summary>` + expand

Built-in names: `read`, `edit`, `write`, `bash`, `powershell`, `grep`, `find`, `ls` (`core/tools/index.d.ts:23`).

**Detect-and-no-op rules** (the mechanism we agreed on):
- Feature-detect each method before wrapping: if `ToolExecutionComponent.prototype.getRenderShell` is not a function, install nothing, `ctx.ui.notify(...)` once per session, and return.
- If another extension patched the same method after us, notice that our wrapper is no longer the current one on shutdown and do **not** clobber it (store the predecessor descriptor, restore only if we are still the outermost).
- Never mutate the tool result, never hook `tool_result` — model context and session files stay byte-identical.

### Layer 3 — subagent rows: config, not code

pi-subagents already renders `subagent` and exposes exactly the opencode knobs (`pi-subagents/docs/configuration.md:100-130`):

```json
{
  "inlineToolDisplay": "summary",
  "mainWindowRenderer": { "horizontalSpacing": 0, "compactResultMaxLines": 4 },
  "foregroundDetachShortcut": "ctrl+b"
}
```

- `"summary"` → one stable row (`✓ reviewer · completed`) for every state; no animation, no inline body.
- `"rich"` + `compactResultMaxLines: 4` → live child activity with a 4-line collapsed preview, expandable. **Default plan: `rich` with `horizontalSpacing: 0`, because that is the opencode two-line live look.** Flip to `summary` with one config edit if it still feels busy.
- Our extension does not touch the `subagent` renderer (Layer 2 rule 2). It only adds the `↳ /subagents-fleet` hint to our own status line while a subagent is in flight.

**Dive-in (already built, we just expose it):** `/subagents-fleet` opens the live fleet inspector with Markdown and tool transcripts plus session paths; `pi-subagents` also writes each child to `<runId>/run-0/session.jsonl` and returns `sessionPath` per child. So the answer to "dive into subagents" is: don't build a viewer. Two things we add, both cheap:
1. While a `subagent` call is running, the Layer 1 status line ends with `↳ /subagents-fleet`.
2. A `/opencode-ui` menu entry that prints the current subagent run ids and their session paths, so a dive-in is one keypress away.

If a *better* dive-in is wanted later (open the child session in a `ctx.ui.custom()` overlay with j/k), that is a separate milestone behind the existing `/subagents-fleet` — not a v1 requirement.

### Layer 4 — configuration

`getAgentDir() + "/opencode-ui.json"` plus a `/opencode-ui` command using `ctx.ui.select()`:

- `statusLine: boolean` (default true)
- `compactTools: boolean` (default true)
- `maxOutputLines: number` (default 0 = hidden while collapsed, mirroring opencode)
- `subagentHint: boolean` (default true)

Every option is read at render time so a change takes effect on `/reload` with no restart.

## 4. Milestones

Each leaves one runnable check (plain `node --test` or an `assert`-based script — no test framework).

1. **Status line only** — events → `setWorkingMessage`. Check: simulated start/end sequence yields `Read  x.ts`, then `+1 more`, then default.
2. **`getRenderShell` → `"self"`**, with detect-and-no-op. Check: render a `ToolExecutionComponent`, assert no `Box` child and no `toolPendingBg` escape; and a second test that a missing method installs nothing.
3. **Compact rows for the 8 built-ins** — table of `toolName → (args, result) → one line`. Check: table-driven, one assert per tool.
4. **Expand delegates to the predecessor renderer.** Check: `expanded: true` output contains the original result text.
5. **Subagent hint + `/opencode-ui` command**, with the config file.
6. **Package/publish**, mirroring zentui's manifest.

## 5. Development workflow (add/remove from this folder)

Three ways to run, in increasing order of "real":

| Mode | Command | Settings touched? |
|---|---|---|
| **Throwaway** (default while coding) | `pi -ne -e ./extensions/opencode-ui/index.ts` | No |
| **Project-local, always on** | `pi install . -l -a` → `pi remove ./ -l -a` | Yes: `.pi/settings.json` |
| **Personal, all projects** | `pi install .` → `pi remove .` | Yes: `~/.pi/agent/settings.json` |

Details and gotchas, all verified by running them:

- `-ne` (`--no-extensions`) disables *discovery* but keeps explicit `-e` paths, so throwaway mode is isolated from every other installed extension. `-e` takes a file or a package path, so `-e .` also works.
- `pi install .` records the **canonical relative form** `".."` in the settings file that declares it (paths resolve from the settings file, not the cwd) — so removal must use the same relative arg, from the same directory, with `-l`:
  ```bash
  pi remove ./ -l -a      # from the project root
  ```
  Removing by absolute path does **not** match, and omitting `-l` searches the wrong settings file.
- Project settings load only after **project trust**. `pi install` writes, but `pi remove` refuses with "Project is not trusted" until you pass `-a/--approve` (or grant trust once). Keep `-a` on both.
- `pi list` shows installed packages, `pi config` toggles individual resources (e.g. disable the extension without uninstalling), `pi update --extensions` reconciles.
- **Hot reload rule:** `/reload` re-runs the extension loader and is fine for Layer 1 / config / renderers. For anything touching `ToolExecutionComponent.prototype`, **restart pi** — a reload leaves the previous module's patch installed on a class the new module may not share, and the detect-and-no-op rules cannot see it. Cheap rule, avoids a confusing bug.
- **Zero-install check:** `node --test test/` (or `node test/x.mjs`) for the renderers and status-line logic, with the pi packages resolved from the global install. No `npm install` needed while iterating; add dev deps (`typescript`, `@biomejs/biome`) only when we're ready to publish.
- **Kill switch:** if a patch ever misbehaves at runtime, `pi -ne` (or `pi config` → disable) restores stock Pi immediately without uninstalling.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Patch breaks on pi upgrade (private methods renamed) | Feature-detect before wrapping; no-op + one-time notification; pin peer range in `package.json` |
| Another extension patches the same class | Restore only if we are still outermost; documented in the wrapper |
| `subagent` detail without a fleet view | Already covered by `/subagents-fleet`; degrade to `↳ running` |
| `/reload` leaves a stale patch | Restart for patch changes (dev rule above); patch install is idempotent per process |
| Too much hidden information | Expand is preserved everywhere; `maxOutputLines` escape hatch |
| Custom config file diverges from pi-subagents' own config | Layer 3 *writes* pi-subagents' documented keys rather than reimplementing them; document both in README |

## 7. Non-goals

- Reimplementing opencode's diff view, file tree, permission prompts, or a subagent viewer.
- Changing the editor, footer, themes, or any tool's execution.
- Rendering tool output for tools that already ship their own `renderResult` (`subagent` included).
- Reimplementing zentui. Borrow its patch/restore idea (~30 lines), not its 210-line patch registry — one patch, one stored predecessor, one owner.

## 8. Progress

- [x] **M1** live status line (`extensions/opencode-ui/status-line.ts`, wired in `index.ts`) — `npm test` (17 checks) + load verified in pi.
- [x] **M2** `getRenderShell` -> `"self"` with detect-and-no-op (`patch.ts`, `compact-shell.ts`) — 22 checks; verified the stock band disappears and restores cleanly
- [ ] M3 compact rows for the 8 built-ins
- [ ] M4 expand delegates to the predecessor renderer
- [ ] M5 subagent hint + `/opencode-ui` command + config
- [ ] M6 package/publish
