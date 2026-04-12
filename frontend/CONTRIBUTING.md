# Contributing to Ontology Playground

Thank you for your interest in contributing to the Ontology Playground! This
project welcomes contributions and suggestions.

## Contributor License Agreement

Most contributions require you to agree to a Contributor License Agreement (CLA)
declaring that you have the right to, and actually do, grant us the rights to
use your contribution. For details, visit
<https://cla.opensource.microsoft.com>.

When you submit a pull request, a CLA bot will automatically determine whether
you need to provide a CLA and decorate the PR appropriately (e.g., status check,
comment). Simply follow the instructions provided by the bot. You will only need
to do this once across all repos using our CLA.

## Code of Conduct

This project has adopted the
[Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/)
or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any
additional questions or comments.

---

## How to Contribute

### Reporting Issues

- Use GitHub Issues to report bugs or request features
- Include steps to reproduce for bugs
- Search existing issues before creating a new one

### Contributing an Ontology to the Catalogue

The easiest way to contribute is to add an ontology to the community catalogue:

1. **Fork** this repository
2. Create a directory for your ontology:
   ```
   catalogue/community/<your-github-username>/<ontology-slug>/
   ```
3. Add two files:
   - **`<ontology-slug>.rdf`** — your ontology in RDF/OWL format (you can
     export from the Ontology Playground UI)
   - **`metadata.json`** — metadata describing your ontology:
     ```json
     {
       "id": "<ontology-slug>",
       "name": "My Ontology",
       "description": "A short description of what this ontology models",
       "icon": "🔧",
       "category": "general",
       "tags": ["example", "tutorial"],
       "author": "<your-github-username>"
     }
     ```
4. Validate locally:
   ```bash
   npm ci
   npm run catalogue:build   # must succeed
   npm test                  # all tests must pass
   ```
5. **Open a Pull Request** against the `main` branch
   - CI will automatically validate your RDF and metadata
   - A maintainer will review and merge

#### Metadata Schema

The `metadata.json` file must conform to the schema at
[`catalogue/metadata-schema.json`](catalogue/metadata-schema.json).

| Field         | Required | Description                                              |
|---------------|----------|----------------------------------------------------------|
| `id`          | Yes      | URL-safe slug (`lowercase-with-hyphens`)                 |
| `name`        | Yes      | Human-readable name                                      |
| `description` | Yes      | Short description                                        |
| `category`    | Yes      | One of: `retail`, `healthcare`, `finance`, `manufacturing`, `education`, `general` |
| `icon`        | No       | Emoji icon for display                                   |
| `tags`        | No       | Array of tags for filtering                              |
| `author`      | No       | Your GitHub username or name                             |

### Contributing Code

1. Fork and create a feature branch: `feature/<feature-name>`
2. Follow the coding conventions in [AGENTS.md](AGENTS.md)
3. Write tests for new functionality
4. Ensure the build passes:
   ```bash
   npm run build    # includes catalogue compilation + TypeScript + Vite
   npm test         # all tests must pass
   ```
5. Open a Pull Request with a clear description of changes

### Development Setup

```bash
git clone https://github.com/<your-fork>/Ontology-Playground.git
cd Ontology-Playground
npm install
npm run dev       # start development server
npm test          # run tests
npm run build     # full production build
```

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
