# Coding Guidelines for AI Agents

This document contains guidelines for AI coding assistants working on this project.

## Git Workflow

### Branching Strategy
- **Main branch**: `main` - production-ready code only
- **Feature branches**: `feature/<feature-name>` - for new features
- **Bugfix branches**: `fix/<issue-description>` - for bug fixes
- **Always create a feature branch** before making changes to existing functionality

### Commit Practices
- **Commit incrementally** - small, focused commits that do one thing
- **Use conventional commits** format:
  - `feat:` - new features
  - `fix:` - bug fixes
  - `docs:` - documentation changes
  - `refactor:` - code refactoring
  - `test:` - adding or updating tests
  - `chore:` - maintenance tasks
- **Write descriptive commit messages** with a summary line and bullet points for details
- **Verify build passes** before committing (`npm run build`)

### Before Merging
- Test changes locally (`npm run dev`)
- Ensure no TypeScript errors
- Review the diff for unintended changes
- **Update documentation** — if the change adds, removes, or modifies user-visible
  features, update `README.md` (feature descriptions, route table, env vars) and
  any relevant guides in `docs/` before merging. Also update `TODO.md` to mark
  completed items.

## Project Structure

```
Ontology-Playground/
├── src/
│   ├── components/    # React components (graph, designer, modals, tour, learn)
│   ├── data/          # Data models, templates, and sample data
│   ├── lib/           # Router, RDF parser/serializer, catalogue helpers
│   ├── store/         # Zustand state management (app + designer)
│   ├── styles/        # CSS styles
│   └── types/         # TypeScript type definitions
├── catalogue/         # Official + community ontology RDF files
├── content/learn/     # Markdown articles for the learning section
├── scripts/           # Build-time compilers (catalogue, learning content)
├── docs/              # Guides and documentation
├── api/               # Azure Functions backend (optional)
├── build/             # Production build output
└── public/            # Static assets (compiled catalogue.json, learn.json)
```

## Code Style

### TypeScript
- Use strict TypeScript - no `any` types unless absolutely necessary
- Define interfaces for all data structures
- Export types from dedicated type files or alongside their implementations

### React Components
- Use functional components with hooks
- Keep components focused - split large components
- Use the existing component patterns in `src/components/`

### State Management
- Use Zustand store (`src/store/appStore.ts`) for global state
- Keep component-local state with `useState` when appropriate

## Testing Changes

```bash
# Development server
npm run dev

# Production build
npm run build

# Type checking
npx tsc --noEmit
```

## Common Tasks

### Adding a New Export Format
1. Add format type to the state (`exportFormat` union type)
2. Create export function (`exportAs<Format>`)
3. Add format handler in `handleExport()`
4. Add UI button in the format selector

### Adding a New Component
1. Create component file in `src/components/`
2. Export from `src/components/index.ts`
3. Follow existing component patterns for modals/panels

## Dependencies

- **React 19** - UI framework
- **TypeScript 5** - Type safety
- **Vite** - Build tool
- **Cytoscape.js** - Graph visualization
- **Zustand** - State management
- **Framer Motion** - Animations
- **Lucide Icons** - Icon library
- **marked** - Markdown compilation (build-time)
