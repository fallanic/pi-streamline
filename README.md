# pi-streamline

Streamlined tool rendering for [Pi](https://github.com/earendil-works/pi): a single live
status line while work runs, and one line per tool call in the transcript.

```
◐ Bash  npm test
✓ Read  src/parser.ts  42 lines · 120ms
✗ Grep  TODO  3 lines
```

Nothing is hidden permanently — press Pi's expand key (`ctrl+o`) or click a row for the full
output, exactly as Pi renders it today. An expanded row gets Pi's own tool background so it reads
as an open block, and clicking a row low in the viewport scrolls it to the top, since the
transcript is bottom-anchored. Clicking needs Pi's fullscreen TUI mode (`/config` → TUI mode →
`fullscreen`); Pi's regular mode never asks the terminal for mouse input. Tool execution, results,
and the session file are untouched.

## Requirements

Pi 0.87.1 or newer. No runtime dependencies; `@earendil-works/pi-*` are peer dependencies
supplied by Pi.

## Install

From GitHub:

```bash
pi install git:github.com/fallanic/pi-streamline
```

For development, install this folder instead — Pi loads the files directly, so edits show up
on the next run:

```bash
git clone https://github.com/fallanic/pi-streamline.git
cd pi-streamline && npm install    # dev dependencies, for the tests only
pi install . -l -a
```

Try it for a single run without touching any settings:

```bash
pi -ne -e ./extensions/opencode-ui/index.ts
```

## Uninstall

```bash
pi remove git:github.com/fallanic/pi-streamline      # installed from GitHub
pi remove ./ -l -a                                    # installed from this folder
```

A local install is recorded in `.pi/settings.json` as the relative path `..`, and paths
resolve from the settings file that declares them — so remove it from the project root, with
`-l`, using the same argument you installed with. `-a` is needed until the project is trusted.

`pi list` shows what is installed. Nothing else to undo: the only file the extension writes is
`~/.pi/agent/opencode-ui.json`, and deleting it restores the defaults.

## Settings

`/opencode-ui` opens a menu that applies immediately and persists to
`~/.pi/agent/opencode-ui.json`:

| Setting | Default | Effect |
| --- | --- | --- |
| `compactTools` | `on` | One-line tool rows. Turn off to restore Pi's default tool view. |
| `outputPreviewLines` | `0` | Lines of output inside a collapsed row: 0 (hidden), 3, or 8 |
| `statusLine` | `on` | Replace Pi's default "Working..." message with explicit tool states (running/done/failed + duration) |
| `subagentHint` | `on` | Append `↳ /subagents-fleet` while a `pi-subagents` subagent runs (only works with `pi-subagents`) |

Subagent rows are rendered by `pi-subagents` itself, which this extension deliberately leaves
alone. To get the opencode two-line live form there, set in your `pi-subagents` config:

```json
{ "inlineToolDisplay": "rich", "mainWindowRenderer": { "horizontalSpacing": 0, "compactResultMaxLines": 4 } }
```

## How it works

Pi's `ToolExecutionComponent` paints every tool call inside a padded `Box` filled with
`toolPendingBg` / `toolSuccessBg` / `toolErrorBg`, then dumps the result body underneath. This
extension replaces three methods on that class's prototype:

- `getRenderShell` returns `"self"`, so content renders without the background band
- `getCallRenderer` / `getResultRenderer` return a one-line row for the eight built-in tools

That is private API, so every seam is feature-detected. If Pi renames or removes any of them,
the extension detects the miss, notifies once, and runs with stock Pi rendering instead of
failing. The uninstaller restores the original descriptor, and only while the patch is still the
outermost one, so it never clobbers another extension's patch.

Tools not in the built-in list — `subagent` and every other extension tool — keep Pi's own
renderers. No tool execution, result, or model context is ever modified, and nothing is sent
anywhere.

## Development

```bash
npm test        # node --test, no build step
```

`/reload` picks up changes to the status line, settings, and row rendering. **Restart Pi after
removing or renaming a patch**: a reload cannot un-apply a patch that no longer exists in the
code. If a row ever looks stale or doubled, restart first.

See [PLAN.md](PLAN.md) for the design and milestone history.
