# Open Investment Model (OpenIM): Playground adaptation

This entry is an adaptation of the Open Investment Model ontology for the Ontology Playground. It is not the canonical model.

The Open Investment Model (OpenIM) is an open, MIT-licensed, vendor-neutral reference model for institutional investment management: a decomposition of the buy-side firm into service domains and a canonical entity model. It aligns its entities to FIBO where the meaning matches and complements other standards such as ISDA CDM, ILPA, GIPS and ISO 20022. The canonical model is at https://openinvestmentmodel.org/ and the source repository is https://github.com/antikas/open-investment-model.

## Source

| | |
|---|---|
| OpenIM release | v0.3.2 |
| Source file | https://github.com/antikas/open-investment-model/raw/v0.3.2/exports/openim.rdf |
| Source file SHA-256 | `ea1e41392cfa8c39d4feec97623dfad17649548834b602311e70d34fbe37a0ad` |
| `ontology.rdf` SHA-256 | `768fb96d0e70f5f091efef5e0c66de78c0a2c9ade367000e7624aa4b7cb64725` |
| Mapping (one row per source class, object property and datatype property) | https://github.com/antikas/open-investment-model/raw/v0.3.2/exports/openim-playground-mapping.csv |
| Same ontology file in the OpenIM repository | https://github.com/antikas/open-investment-model/raw/v0.3.2/exports/openim-playground.rdf |

`ontology.rdf` is a byte copy of `exports/openim-playground.rdf`. The SHA-256 of the source file is of its published bytes with LF line endings.

## What is in the entry

86 entity types, 919 properties and 428 relationships, drawn from 86 classes, 914 datatype properties and 336 object properties of the source ontology (plus 5 inherited identifier properties, rule 2). Every source class, object property and datatype property has one row in the mapping; 160 of them are not drawn, each with its reason in the mapping.

The relationships are 118 relation verbs between one pair of classes, and 310 relationships that stand for 58 relation verbs over several classes (see rule 5). A relation verb and its inverse are separate relationships; every one of the 428 relationships is in a declared inverse pair.

## Regenerate

From a clone of the OpenIM repository at the release tag:

```
git clone --branch v0.3.2 https://github.com/antikas/open-investment-model
cd open-investment-model
python -m pip install -r tools/playground/requirements.txt
python tools/playground/entry.py --out <folder>
```

The command reads `exports/openim.rdf`, `CITATION.cff` and the MIT licence, and refuses unless `exports/openim.rdf` is byte for byte the file published at the release tag (it compares SHA-256 digests with the file at git tag `v0.3.2`). It checks its own output before writing this folder. Running it twice gives identical files.

## What the adaptation changes

The Ontology Playground reads an ontology more narrowly than OWL allows, and limits names. The adaptation applies these rules, and only these; the mapping names the rules applied to each source item.

1. **Entity names.** An entity is named by its title in PascalCase, at most 26 letters and digits and unique. A longer title loses its parenthetical gloss, then hyphenated words shrink to their initials, then words are abbreviated from a fixed table (for example `Agreement` to `Agmt`), so the name keeps the title's meaning; `ETF Authorised-Participant Agreement` becomes `ETFAPAgreement`, still the agreement. Only if a title still does not fit are trailing words dropped and, as the final step, the name cut at 26 characters. The mapping records each shortened name with its full title and every step used. Each entity's description starts with its OpenIM code and title, so the canonical identifier is always in view. Entities are coloured by the prefix of their OpenIM code.
2. **Identifiers.** The Playground needs at least one identifier property per entity. The entity's own key, as the model declares it (the ontology marks each key column with `openim:keyPosition`), is marked as identifier (81 entities). A composite key marks every one of its columns as identifier (the Playground accepts several identifier properties; its Fabric export uses the first), and the key columns are written first, in key order: E-04. A specialisation's key is its parent's key, carried by a foreign key that is drawn as a relationship, so for the 5 entities whose key is only a foreign key a property named and typed like the nearest ancestor's declared key is added to the entity and marked as identifier; these are the only properties in the entry that are not source datatype properties.
3. **Property names.** A property name over 26 characters drops stop words, then abbreviates words from a fixed table (for example `basis_points` to `bps`, `percentage` to `pct`, `settlement` to `settle`) until it fits (15 properties); an identifier keeps its `_id`, and the source name stays in the description and in the mapping. A name that clashes within its entity gets a numeric suffix (0 properties).
4. **Property types.** The Playground allows one type per property name across the ontology, so a name used with different types is widened to string (1 property); the declared type stays in the description. A property whose range is `rdfs:Literal` (document, map or array) is typed string explicitly (31 properties).
5. **Relation verbs over several classes.** The Playground reads one class as a relationship's domain and one as its range, so a relation verb whose domain or range is a union of classes is drawn as one relationship per class pair, each a sub-property of the verb (56 verbs). The identifiers of these relationships, and of the added identifier properties, are minted in the adaptation's own namespace, `https://w3id.org/openim/ontology/playground/`, never in the canonical OpenIM namespace. A verb whose domain and range are both unions is drawn for the pairs the source states as `rdfs:subClassOf`, which is how specialisation is shown (2 verbs). Declared inverses are kept pair by pair.
6. **Foreign keys, identifiers and labels.** A foreign-key column whose relation verb already draws the same two classes is not drawn a second time (160 columns; the mapping gives each one's reason and the verb it duplicates, and the column keeps its canonical IRI without a domain or range). A foreign-key column with no such verb would be drawn (there is none in this release) under an identifier in the adaptation namespace qualified by its owner's OpenIM code, because the Playground identifies a relationship by the last part of its IRI and column names repeat. Relationship labels are lower snake_case at their full length. Each relationship carries its cardinality, taken from its relation verb (flipped for the inverse) and many-to-one for a foreign-key column without a verb.

Everything else in the source is kept as it is, including the FIBO alignment statements (`owl:equivalentClass` and `skos:closeMatch`), `rdfs:subClassOf` and `owl:inverseOf`. The ontology header names this file's source release, file and digest with `prov:wasDerivedFrom`, `dcterms:source` and `owl:versionInfo`.

## Licence

OpenIM is released under the MIT licence. The licence is in `LICENSE` in this folder and applies to this entry: Copyright (c) 2026 Georgios Antikatzidis.
