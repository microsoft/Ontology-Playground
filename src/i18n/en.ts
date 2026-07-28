/**
 * English strings — the source of truth for translation keys.
 *
 * `ko.ts` is typed as Record<keyof typeof en, string>, so adding a key here
 * without adding it there is a compile error.  Keys are grouped by screen.
 * Placeholders use {braces}.
 */
export const en = {
  // ─── Common ───────────────────────────────────────────────────────────────
  'common.add': 'Add',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.copy': 'Copy',
  'common.copied': 'Copied!',
  'common.name': 'Name',
  'common.description': 'Description',
  'common.type': 'Type',
  'common.back': 'Back',
  'common.expand': 'Expand',
  'common.collapse': 'Collapse',
  'common.unnamed': 'Unnamed',
  'common.language': 'Language',

  // ─── Header ───────────────────────────────────────────────────────────────
  'header.untitledOntology': 'Untitled Ontology',
  'header.points': 'points',
  'header.badges': 'badges',
  'header.share': 'Share',
  'header.shareEncoding': 'Encoding…',
  'header.shareDownloaded': 'Downloaded RDF',
  'header.shareLinkTitle': 'Copy shareable link to this ontology',
  'header.shareTitle': 'Share this ontology via link',
  'header.summary': 'Summary',
  'header.summaryTitle': 'View Ontology Summary',
  'header.aiBuilder': 'AI Builder',
  'header.catalogue': 'Catalogue',
  'header.designer': 'Designer',
  'header.school': 'Ontology School',
  'header.importExport': 'Import / Export',
  'header.help': 'Help',
  'header.about': 'About',
  'header.dataSources': 'Data Sources',
  'header.theme': 'Theme',
  'header.menu': 'Menu',

  // ─── Gallery / catalogue ──────────────────────────────────────────────────
  'gallery.title': 'Ontology Gallery',
  'gallery.searchPlaceholder': 'Search by name, tag, author…',
  'gallery.allSources': 'All sources',
  'gallery.official': 'Official',
  'gallery.external': 'External',
  'gallery.community': 'Community',
  'gallery.allCategories': 'All categories',
  'gallery.loading': 'Loading catalogue…',
  'gallery.noMatches': 'No ontologies match your filters.',
  'gallery.showing': 'Showing {shown} of {total} ontologies',
  'gallery.active': 'Active',
  'gallery.entities': '{count} entities',
  'gallery.relationships': '{count} relationships',
  'gallery.viewRdf': 'View RDF source',
  'gallery.copyEmbed': 'Copy embed code',
  'gallery.editInDesigner': 'Edit in Designer',
  'gallery.load': 'Load',
  'gallery.showMore': 'Show more ({count} remaining)',
  'gallery.contributePrefix': 'Want to contribute? See',
  'gallery.contributeMiddle': '— add your ontology as an RDF file and',
  'gallery.contributeLink': 'open a PR',

  // ─── Import / Export ──────────────────────────────────────────────────────
  'io.title': 'Import / Export Ontology',
  'io.currentlyLoaded': 'Currently Loaded',
  'io.exportCurrent': 'Export Current',
  'io.importOntology': 'Import Ontology',
  'io.loadedOk': 'Ontology loaded successfully!',
  'io.downloadRdf': 'Download RDF/OWL',
  'io.rdfFormatTitle': 'RDF/XML format for MS Fabric',
  'io.dropJsonOrRdf': 'Drop JSON or RDF/OWL file here',
  'io.dropRdf': 'Drop RDF/OWL (.rdf, .owl, .iq) file here',
  'io.parseFailed': 'Failed to parse file',
  'io.invalidStructure':
    'Invalid ontology structure. Must have ontology.entityTypes and ontology.relationships.',

  // ─── Summary modal ────────────────────────────────────────────────────────
  'summary.title': 'Ontology Summary',
  'summary.copyToClipboard': 'Copy to clipboard',

  // ─── Data sources modal ───────────────────────────────────────────────────
  'dataSources.title': 'Data Sources',
  'dataSources.lakehouse': 'Data Lakehouse',
  'dataSources.sourceTable': 'Source Table:',
  'dataSources.property': 'Property',
  'dataSources.column': 'Column',
  'dataSources.otherEntityTypes': 'Other Entity Types:',

  // ─── Query playground ─────────────────────────────────────────────────────
  'query.clear': 'Clear',
  'query.clearLabel': 'Clear query',
  'query.runLabel': 'Run query',
  'query.title': 'Natural Language Query (NL2Ontology)',
  'query.tryAsking': 'Try asking:',
  'graph.zoomIn': 'Zoom In',
  'graph.zoomOut': 'Zoom Out',
  'graph.fit': 'Fit to View',
  'graph.reset': 'Reset Layout',
  'graph.downloadPng': 'Download Graph as PNG',
  'graph.focusMode': 'Focus mode',
  'graph.legendTitle': 'Entity Types',
  'learn.previous': 'Previous',
  'learn.next': 'Next',
  'query.askAbout': 'Ask about {name}...',
  'quest.beginner': 'Beginner',
  'quest.intermediate': 'Intermediate',
  'quest.advanced': 'Advanced',

  // ─── Guided tour ──────────────────────────────────────────────────────────
  'tour.closeLabel': 'Close tour',
  'tour.next': 'Next',
  'tour.getStarted': 'Get started!',
  'tour.skip': "Skip tour · don't show again",
  'tour.graphTitle': 'Ontology Graph',
  'tour.graphText':
    'This is your ontology visualized as an interactive graph. Click on entity nodes or relationship edges to inspect them.',
  'tour.questsTitle': 'Quests',
  'tour.questsText':
    'Complete guided quests to learn ontology concepts step by step. Earn badges and points along the way!',
  'tour.inspectorTitle': 'Inspector & Query',
  'tour.inspectorText':
    'Select an entity to see its properties and data bindings. Use the query bar at the bottom to ask natural language questions.',
  'tour.designerTitle': 'Ontology Designer',
  'tour.designerText':
    'Build your own ontologies from scratch or start from a template. Export as RDF or submit to the community catalogue.',
  'tour.navTitle': 'Navigation & Actions',
  'tour.navText':
    'Use the toolbar to access the Catalogue, Designer, Learn articles, Import/Export, and more. Press ⌘K anytime to open the command palette.',

  // ─── Fabric export ────────────────────────────────────────────────────────
  'fabric.title': 'Push to Microsoft Fabric',
  'fabric.connect': 'Connect to Workspace',
  'fabric.tokenPlaceholder': 'Paste your bearer token here',
  'fabric.workspacePlaceholder': '00000000-0000-0000-0000-000000000000',
  'fabric.bothRequired': 'Both token and workspace ID are required.',
  'fabric.invalidWorkspace':
    'Workspace ID must be a valid UUID (e.g., cfafbeb1-8037-4d0c-896e-a46fb27ff229).',
  'fabric.connectFailed': 'Failed to connect to workspace',
  'fabric.createAndPush': 'Create & Push',
  'fabric.creating': 'Creating ontology in Fabric...',
  'fabric.created': 'Ontology Created!',
  'fabric.updateDefinition': 'Update Definition',
  'fabric.updating': 'Updating ontology definition...',
  'fabric.updated': 'Definition Updated!',
  'fabric.pushFailed': 'Push failed',
  'fabric.workspace': 'Workspace:',
  'fabric.name': 'Name:',
  'fabric.id': 'ID:',
  'fabric.subtitle': 'Create or update an ontology in your Fabric workspace',
  'fabric.summary': '{entities} entity types, {relationships} relationships',
  'fabric.workspaceId': 'Workspace ID',
  'fabric.workspaceHint': 'Find this in Fabric portal → Workspace settings → Overview',
  'fabric.accessToken': 'Access Token',
  'fabric.connecting': 'Connecting...',
  'fabric.action': 'Action',
  'fabric.createNew': 'Create New',
  'fabric.selectOntology': 'Select Ontology',
  'fabric.mayTakeAMoment': 'This may take a moment while Fabric provisions the resource.',
  'fabric.pushFailedRetry': 'Push failed. Check the error above and try again.',
  'fabric.startOver': 'Start Over',

  // ─── NL builder ───────────────────────────────────────────────────────────
  'nl.describeTitle': 'Describe Your Ontology',
  'nl.placeholder': 'Describe your business scenario...',
  'nl.tryExample': 'Try an example:',
  'nl.analyzing': 'Analyzing your description...',
  'nl.generationFailed': 'Generation Failed',
  'nl.editJson': 'Edit JSON',
  'nl.preview': 'Preview',
  'nl.invalidJson': 'Invalid JSON in editor',
  'nl.generateFailed': 'Failed to generate ontology',
  'nl.unknownError': 'An unknown error occurred',
  'nl.startVoice': 'Start voice input',
  'nl.stopRecording': 'Stop recording',
  'nl.micDenied': 'Microphone access denied',
  'nl.speechUnsupported': 'Speech recognition not supported',
  'nl.speechNetwork': 'Network error - try Chrome or Safari',
  'nl.speechStartFailed': 'Failed to start - try Chrome or Safari',
  'nl.generateOntology': 'Generate Ontology',
  'nl.entities': 'Entities ({count})',
  'nl.relationships': 'Relationships ({count})',
  'nl.backArrow': '← Back',
  'nl.applyOntology': 'Apply Ontology',
  'nl.tryAgain': 'Try Again',

  // ─── Quests ───────────────────────────────────────────────────────────────
  'quest.title': 'Quests',
  'quest.abandon': 'Abandon',
  'quest.points': '+{count} pts',
  'quest.earnedBadges': 'Earned Badges ({count})',
  'quest.total': 'Total: {count} points',

  // ─── Help modal ───────────────────────────────────────────────────────────
  'help.title': 'How to Use Ontology Playground (Preview)',
  'help.exploreTitle': 'Explore the Graph',
  'help.exploreText':
    'Click any entity type (coloured node) to see its properties, relationships, and data bindings. Click a relationship line to see how entities connect. Use the controls in the bottom-left to zoom and reset the layout.',
  'help.questsTitle': 'Complete Quests',
  'help.questsText':
    'Select a quest from the left panel to start a guided journey. Follow the instructions to click on specific entities or relationships. Complete all steps to earn badges and points!',
  'help.nlTitle': 'Ask Natural Language Questions',
  'help.nlText':
    'Use the query playground in the bottom-right to ask questions like "Show me Gold tier customers" or "Which products come from Ethiopia?". The graph will highlight relevant entities and relationships.',
  'help.bindingsTitle': 'View Data Bindings',
  'help.bindingsText':
    'When you select an entity type, the inspector shows how ontology properties map to real data sources in a data lakehouse, including lakehouse tables and semantic models.',
  'help.aboutFabricTitle': 'About Microsoft Fabric IQ Ontology',
  'help.aboutFabricText':
    'An ontology is a shared, machine-understandable vocabulary of your business. It defines entity types (like Customer, Product), their properties, and relationships. This demo uses a fictional "Fourth Coffee" to illustrate these concepts.',
  'help.shortcutsTitle': 'Keyboard Shortcuts',
  'help.shortcutPalette': 'Open command palette',
  'help.shortcutHelp': 'Open this help dialog',
  'help.shortcutEsc': 'Close any dialog',
  'help.shortcutNavigate': 'Navigate palette results',
  'help.shortcutSelect': 'Select palette command',
  'help.gotIt': 'Got it!',

  // ─── About modal ──────────────────────────────────────────────────────────
  'about.title': 'About Ontology Playground',
  'about.closeLabel': 'Close about dialog',
  'about.intro':
    'Ontology Playground is a community learning and design experience for building RDF/OWL ontologies, exploring graph relationships, and preparing models compatible with Microsoft Fabric IQ workflows.',
  'about.learnMore': 'Learn more about Microsoft Fabric IQ:',
  'about.trademarkTitle': 'Trademark Notice',
  'about.trademarkText':
    'Trademarks This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow Microsoft’s Trademark & Brand Guidelines. Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos are subject to those third-party’s policies.',

  // ─── Welcome modal ────────────────────────────────────────────────────────
  'welcome.title': 'Welcome to Ontology Playground (Preview)',
  'welcome.subtitle': 'Explore Microsoft Fabric IQ Ontology through the lens of Fourth Coffee',
  'welcome.entityTypes': 'Entity Types',
  'welcome.entityTypesText': 'Discover reusable logical models like Customer, Product, and Order',
  'welcome.relationships': 'Relationships',
  'welcome.relationshipsText': 'See how entities connect with typed, directional links',
  'welcome.bindings': 'Data Bindings',
  'welcome.bindingsText': 'Connect ontology concepts to real data platform sources',
  'welcome.nlQueries': 'NL Queries',
  'welcome.nlQueriesText': 'Ask questions in natural language and traverse the graph',
  'welcome.start': 'Start Exploring',
  'welcome.footer': 'Complete quests to earn badges and learn about Microsoft Fabric IQ Ontology',

  // ─── Command palette ──────────────────────────────────────────────────────
  'palette.placeholder': 'Type a command…',
  'palette.noResults': 'No matching commands',

  // ─── Command palette items ────────────────────────────────────────────────
  'cmd.catalogue': 'Open Catalogue',
  'cmd.designer': 'Open Designer',
  'cmd.learn': 'Open Ontology School',
  'cmd.importExport': 'Import / Export',
  'cmd.summary': 'View Summary',
  'cmd.about': 'About & Trademark Notice',
  'cmd.help': 'Help',
  'cmd.dataSources': 'Data Sources',
  'cmd.theme': 'Switch Theme',

  // ─── Ontology School (chrome only — article bodies stay in English) ───────
  'learn.title': 'Ontology School',
  'learn.allCourses': 'All courses',
  'learn.playground': 'Playground',
  'learn.backTo': 'Back to {label}',
  'learn.toggleTheme': 'Toggle Theme',
  'learn.startLab': 'Start lab',
  'learn.startLearning': 'Start learning',
  'learn.lab': 'Lab',
  'learn.learningPath': 'Learning Path',
  'learn.overview': 'Overview',
  'learn.step': 'Step {n}',
  'learn.openStep': 'Open step',
  'learn.readArticle': 'Read article',
  'learn.present': 'Present',
  'learn.presentTitle': 'Present as slides',
  'learn.catalogueLoadFailed': 'Failed to load catalogue',
  'learn.prevSlide': 'Previous slide',
  'learn.nextSlide': 'Next slide',
  'learn.prevNamed': 'Previous: {title}',
  'learn.nextNamed': 'Next: {title}',
  'learn.before': 'Before',
  'learn.after': 'After',
  'learn.toggleFullscreen': 'Toggle fullscreen',
  'learn.heroText': 'Learning paths and hands-on labs to help you understand and build ontologies for Microsoft Fabric IQ.',
  'learn.path': 'Path',
  'learn.steps': 'steps',
  'learn.articles': 'articles',
  'learn.underReview': '🔍 Under human review',
  'learn.loading': 'Loading…',
  'learn.loadFailed': 'Failed to load learning content: {error}',

  // ─── Inspector ────────────────────────────────────────────────────────────
  'inspector.title': 'Inspector',
  'inspector.selectElement': 'Select an Element',
  'inspector.selectElementHint':
    'Click on an entity type or relationship in the graph to inspect its properties, data bindings, and connections.',
  'inspector.relationship': 'Relationship',
  'inspector.entityType': 'Entity Type',
  'inspector.cardinality': 'Cardinality',
  'inspector.relationshipAttributes': 'Relationship Attributes',
  'inspector.properties': 'Properties ({count})',
  'inspector.relationships': 'Relationships ({count})',
  'inspector.dataBindings': 'Data Bindings',

  // ─── Search & filter ──────────────────────────────────────────────────────
  'search.title': 'Search & Filter',
  'search.placeholder': 'Search entities, properties...',
  'search.results': 'Search results',
  'search.entitiesToggle': 'Entities ({count})',
  'search.relationshipsToggle': 'Relationships ({count})',
  'search.noResults': 'No results for "{query}"',
  'search.propertiesCount': '{count} properties',

  // ─── Stats panel ──────────────────────────────────────────────────────────
  'stats.title': 'Ontology Insights',
  'stats.entities': 'Entities',
  'stats.relationships': 'Relationships',
  'stats.properties': 'Properties',

  // ─── Path finder ──────────────────────────────────────────────────────────
  'pathfinder.title': 'Path Finder',
  'pathfinder.selectEntity': 'Select entity…',
  'pathfinder.findPath': 'Find Path',
  'pathfinder.clear': 'Clear',
  'pathfinder.sameEntity': 'Select two different entities.',
  'pathfinder.noPath': 'No directed path found between these entities.',
  'pathfinder.shortestPath': 'Shortest path — {count} hop',
  'pathfinder.shortestPath_plural': 'Shortest path — {count} hops',

  // ─── Footer ───────────────────────────────────────────────────────────────
  'footer.builtWith': 'Built with GitHub Copilot',
  'footer.supervisedBy': 'Supervised by videlalvaro',
  'footer.deployedCommit': 'Deployed commit {sha}',

  // ─── Designer — page chrome ───────────────────────────────────────────────
  'designer.ontologyNamePlaceholder': 'Ontology name',
  'designer.descriptionPlaceholder': 'Description',

  // ─── Designer — toolbar ───────────────────────────────────────────────────
  'designer.undo': 'Undo (Ctrl+Z)',
  'designer.redo': 'Redo (Ctrl+Shift+Z)',
  'designer.new': 'New',
  'designer.newTitle': 'New ontology',
  'designer.validate': 'Validate',
  'designer.validateTitle': 'Validate ontology',
  'designer.exportRdf': 'Export RDF',
  'designer.loadInPlayground': 'Load in Playground',
  'designer.submitToCatalogue': 'Submit to Catalogue',
  'designer.submitToCatalogueTitle': 'Submit to community catalogue',
  'designer.namingAnyScript': 'Any script',
  'designer.namingFabric': 'Fabric IQ names',
  'designer.namingAnyScriptTitle':
    'Any-script names allowed (Korean, Japanese, …). Click to enforce Fabric IQ naming.',
  'designer.namingFabricTitle':
    'Fabric IQ strict naming is ON — names must be ASCII, 1-26 characters. Click to allow any script.',

  // ─── Designer — validation panel ──────────────────────────────────────────
  'designer.noIssues': 'No issues found',
  'designer.issuesToFix': '{count} issue to fix',
  'designer.issuesToFix_plural': '{count} issues to fix',
  'designer.fabricWarnings': '{count} Fabric IQ warning',
  'designer.fabricWarnings_plural': '{count} Fabric IQ warnings',

  // ─── Designer — entities ──────────────────────────────────────────────────
  'designer.entityTypes': 'Entity Types ({count})',
  'designer.addEntityType': 'Add entity type',
  'designer.noEntities': 'No entity types yet. Click "Add" to create one.',
  'designer.deleteEntity': 'Delete entity',
  'designer.propsBadge': '{count} props',
  'designer.entityNamePlaceholder': 'Entity name',
  'designer.entityDescriptionPlaceholder': 'What does this entity represent?',
  'designer.icon': 'Icon',
  'designer.color': 'Color',
  'designer.colorSwatch': 'Color {color}',
  'designer.properties': 'Properties ({count})',
  'designer.dragToReorder': 'Drag to reorder',
  'designer.propertyNamePlaceholder': 'Property name',
  'designer.markAsIdentifier': 'Mark as identifier',
  'designer.removeAsIdentifier': 'Remove as identifier',
  'designer.removeProperty': 'Remove property',
  'designer.identifierTypeHint': 'Identifier must be string or integer (currently {type}).',

  // ─── Designer — relationships ─────────────────────────────────────────────
  'designer.relationships': 'Relationships ({count})',
  'designer.addRelationship': 'Add relationship',
  'designer.needEntityForRelationship': 'Create at least one entity to add a relationship',
  'designer.createEntityFirst': 'Create at least one entity first.',
  'designer.noRelationships': 'No relationships yet. Click "Add" to create one.',
  'designer.deleteRelationship': 'Delete relationship',
  'designer.relationshipNamePlaceholder': 'Relationship name',
  'designer.from': 'From',
  'designer.to': 'To',
  'designer.cardinality': 'Cardinality',
  'designer.relationshipDescriptionPlaceholder': 'Describe this relationship',
  'designer.attributes': 'Attributes ({count})',
  'designer.attributeNamePlaceholder': 'Attribute name',
  'designer.attributeTypePlaceholder': 'Type',
  'designer.removeAttribute': 'Remove attribute',

  // ─── Designer — templates ─────────────────────────────────────────────────
  'designer.templateHeading': 'Start from a template',
  'designer.templateSubheading': 'Pick a domain to get started quickly, or add entities manually.',

  'template.retail': 'Retail',
  'template.retailDesc': 'Customers, products, and orders',
  'template.healthcare': 'Healthcare',
  'template.healthcareDesc': 'Patients, providers, and encounters',
  'template.finance': 'Finance',
  'template.financeDesc': 'Accounts, transactions, and parties',
  'template.iot': 'IoT',
  'template.iotDesc': 'Devices, sensors, and readings',
  'template.education': 'Education',
  'template.educationDesc': 'Students, courses, and enrollments',

  // ─── Designer — RDF pane ──────────────────────────────────────────────────
  'designer.tabGraph': 'Graph',
  'designer.tabRdf': 'RDF',
  'designer.editRdf': 'Edit RDF',
  'designer.copyRdf': 'Copy RDF',
  'designer.loadIntoDesigner': 'Load into Designer',
  'designer.pasteRdfFirst': 'Paste RDF/XML content first',
  'designer.failedToParseRdf': 'Failed to parse RDF',
  'designer.rdfPlaceholder': 'Paste or edit RDF/XML content here…',

  // ─── Designer — submit modal ──────────────────────────────────────────────
  'submit.title': 'Submit to Catalogue',
  'submit.description':
    'Share your ontology with the community! Download the files below, then open a pull request on the',
  'submit.repoLink': 'Ontology Playground repo',
  'submit.howTo': 'How to submit',
  'submit.step1': 'Download your ontology RDF and metadata files below.',
  'submit.step2': 'Fork the repository',
  'submit.step3': 'Add the files under',
  'submit.step4': 'Edit metadata.json — fill in your name, category, and tags.',
  'submit.step5': 'Open a pull request against main.',
  'submit.downloadRdf': 'Download RDF',
  'submit.downloadMetadata': 'Download metadata.json',

  // ─── Validation messages ──────────────────────────────────────────────────
  'validation.kind.entityType': 'Entity type',
  'validation.kind.property': 'Property',
  'validation.unnamedEntity': 'Unnamed entity',
  'validation.unnamedRelationship': 'Unnamed relationship',

  'validation.needEntity': 'Add at least one entity type to your ontology.',
  'validation.missingId': '"{label}" is missing an internal ID.',
  'validation.duplicateEntityId': 'Two entities share the same ID "{id}". Rename one of them.',
  'validation.entityHasNoName': 'One of your entities has no name. Give it a name.',
  'validation.noIdentifier':
    '"{label}" has no identifier property. Click the key icon (🔑) on one of its properties to mark it as the unique identifier.',
  'validation.identifierType':
    'Identifier property "{name}" on "{label}" must be string or integer type for Fabric IQ compatibility.',
  'validation.propertyTypeConflict':
    'Property "{name}" is defined as "{type}" in "{label}" but as "{otherType}" in "{otherLabel}". Fabric IQ requires the same type when property names match across entity types.',
  'validation.duplicateRelationshipId':
    'Two relationships share the same ID "{id}". Rename one of them.',
  'validation.danglingFrom':
    '"{label}" points from "{from}" which doesn\'t exist. Pick a valid source entity.',
  'validation.danglingTo':
    '"{label}" points to "{to}" which doesn\'t exist. Pick a valid target entity.',

  'validation.nameExceeds': '{kind} name "{name}" exceeds {max} characters.',
  'validation.nameMustStart': '{kind} name "{name}" must start with a letter or digit.',
  'validation.nameMustEnd': '{kind} name "{name}" must end with a letter or digit.',
  'validation.nameCharsFabric':
    '{kind} name "{name}" may only contain letters, digits, hyphens, and underscores.',
  'validation.nameNoPadding': '{kind} name "{name}" must not start or end with a space.',
  'validation.nameCharsUnicode':
    '{kind} name "{name}" may only contain letters, digits, spaces, and the characters _ - ( ) · . /',
  'validation.fabricSuffix': '{message} (Fabric IQ compatibility — not required locally.)',
} as const;
