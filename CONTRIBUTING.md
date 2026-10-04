# Contributing

Bug reports and PRs welcome.

```bash
git clone https://github.com/fallanic/pi-streamline.git && cd pi-streamline
npm install
npm test        # node --test, no build step
```

`npm install` is only needed to run the tests — the extension itself has no runtime
dependencies, and Pi supplies `@earendil-works/pi-*`.

Keep changes small and follow the existing style: tabs for indentation, one concern per
file, no build step. Add a test next to any change in `extensions/streamline/`; the suite
runs on Node's built-in runner and needs no framework.

Read [PLAN.md](PLAN.md) before touching the rendering paths. The extension patches private
Pi internals (`ToolExecutionComponent` methods), so those seams are feature-detected and
every change there needs a fallback for the case where Pi renames or removes them.