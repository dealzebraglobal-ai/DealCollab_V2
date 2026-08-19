# DealCollab System Cartography

This directory stores a living map of the DealCollab codebase. It is intentionally split into three layers:

- `inventory/`: what exists, including files, routes, tables, environment variables, state objects, and external services.
- `topology/`: how things connect, including the import graph, flow traces, state mutation maps, prompt assembly order, and decision trees.
- `narrative/`: why important pieces exist:
  - `why-cards.json`: Stores the business purpose and architectural context of important files. Explains why a file exists, what business rules it protects, its fragile conditions (things that should not be changed casually), and the potential blast radius (which modules or features could be affected if it is modified).
  - `scar-registry.json`: Stores the project's historical engineering knowledge ("scar tissue"). Documents workarounds, defensive code, bug fixes, and unusual logic that were added to solve past production issues. Explains why seemingly redundant or strange code exists so AI and developers do not remove it during refactoring.
- `meta/`: scan telemetry, timing, and staleness details.

Run `npm run cartography:scan` from the repository root to refresh the automated layers. The narrative files are deliberately manual because they capture institutional memory that scanners cannot infer.

