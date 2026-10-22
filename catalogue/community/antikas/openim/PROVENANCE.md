# OpenIM provenance

- Upstream project: [Open Investment Model](https://github.com/antikas/open-investment-model)
- Source release: [`v0.3.2`](https://github.com/antikas/open-investment-model/releases/tag/v0.3.2)
- Source commit: `0a5aaa3213ff1292d43c031f1e8b5a19356625da`
- Source artifact: `exports/openim.rdf`
- Source SHA-256: `ea1e41392cfa8c39d4feec97623dfad17649548834b602311e70d34fbe37a0ad`
- Catalogue RDF SHA-256: `768fb96d0e70f5f091efef5e0c66de78c0a2c9ade367000e7624aa4b7cb64725`
- Generator: `tools/playground/` in the same release; `python tools/playground/entry.py --out <folder>` in a clone of the tag reproduces `ontology.rdf` byte for byte
- Mapping: [`exports/openim-playground-mapping.csv`](https://github.com/antikas/open-investment-model/raw/v0.3.2/exports/openim-playground-mapping.csv), one row per source class and property with the rule applied
- License: MIT
- Copyright: Copyright (c) 2026 Georgios Antikatzidis

The catalogue RDF is a Playground-oriented adaptation, not a byte-for-byte
copy of the upstream export. `ontology.rdf` is a byte copy of
`exports/openim-playground.rdf` published in the same release. It retains
OpenIM entity codes and directed relationships, and includes
Playground-specific identifier annotations required by the catalogue
validator. `README.md` lists the transformation rules.

The OpenIM project name and namespace are retained for accurate attribution.
Their presence does not imply Microsoft endorsement or that OpenIM is an
official FIBO extension or industry standard.
