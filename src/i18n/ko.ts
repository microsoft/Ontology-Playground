/**
 * Korean strings.
 *
 * Typed against `en`, so a missing or misspelled key fails the type check
 * rather than silently falling back at runtime.
 */
import type { en } from './en';

export const ko: Record<keyof typeof en, string> = {
  // ─── 공통 ─────────────────────────────────────────────────────────────────
  'common.add': '추가',
  'common.cancel': '취소',
  'common.close': '닫기',
  'common.copy': '복사',
  'common.copied': '복사했습니다',
  'common.name': '이름',
  'common.description': '설명',
  'common.type': '자료형',
  'common.back': '뒤로',
  'common.expand': '펼치기',
  'common.collapse': '접기',
  'common.unnamed': '이름 없음',
  'common.language': '언어',

  // ─── 헤더 ─────────────────────────────────────────────────────────────────
  'header.untitledOntology': '제목 없는 온톨로지',
  'header.points': '점',
  'header.badges': '배지',
  'header.share': '공유',
  'header.shareEncoding': '변환 중…',
  'header.shareDownloaded': 'RDF 내려받음',
  'header.shareLinkTitle': '이 온톨로지의 공유 링크 복사',
  'header.shareTitle': '링크로 이 온톨로지 공유',
  'header.summary': '요약',
  'header.summaryTitle': '온톨로지 요약 보기',
  'header.aiBuilder': 'AI 빌더',
  'header.catalogue': '카탈로그',
  'header.designer': '디자이너',
  'header.school': '온톨로지 학습',
  'header.importExport': '가져오기 / 내보내기',
  'header.help': '도움말',
  'header.about': '정보',
  'header.dataSources': '데이터 소스',
  'header.theme': '테마',
  'header.menu': '메뉴',

  // ─── 갤러리·카탈로그 ──────────────────────────────────────────────────────
  'gallery.title': '온톨로지 갤러리',
  'gallery.searchPlaceholder': '이름·태그·작성자로 검색…',
  'gallery.allSources': '모든 출처',
  'gallery.official': '공식',
  'gallery.external': '외부',
  'gallery.community': '커뮤니티',
  'gallery.allCategories': '모든 분류',
  'gallery.loading': '카탈로그를 불러오는 중…',
  'gallery.noMatches': '조건에 맞는 온톨로지가 없습니다.',
  'gallery.showing': '{total}개 중 {shown}개 표시',
  'gallery.active': '사용 중',
  'gallery.entities': '엔티티 {count}개',
  'gallery.relationships': '관계 {count}개',
  'gallery.viewRdf': 'RDF 원본 보기',
  'gallery.copyEmbed': '임베드 코드 복사',
  'gallery.editInDesigner': '디자이너에서 편집',
  'gallery.load': '불러오기',
  'gallery.showMore': '더 보기 ({count}개 남음)',
  'gallery.contributePrefix': '기여하고 싶으십니까? 다음을 보십시오 —',
  'gallery.contributeMiddle': '— 온톨로지를 RDF 파일로 추가하고',
  'gallery.contributeLink': 'PR 을 여십시오',

  // ─── 가져오기·내보내기 ────────────────────────────────────────────────────
  'io.title': '온톨로지 가져오기 / 내보내기',
  'io.currentlyLoaded': '현재 불러온 온톨로지',
  'io.exportCurrent': '현재 온톨로지 내보내기',
  'io.importOntology': '온톨로지 가져오기',
  'io.loadedOk': '온톨로지를 불러왔습니다',
  'io.downloadRdf': 'RDF/OWL 내려받기',
  'io.rdfFormatTitle': 'MS Fabric 용 RDF/XML 형식',
  'io.dropJsonOrRdf': 'JSON 또는 RDF/OWL 파일을 여기에 놓으십시오',
  'io.dropRdf': 'RDF/OWL (.rdf, .owl, .iq) 파일을 여기에 놓으십시오',
  'io.parseFailed': '파일을 해석하지 못했습니다',
  'io.invalidStructure':
    '온톨로지 구조가 올바르지 않습니다. ontology.entityTypes 와 ontology.relationships 가 있어야 합니다.',

  // ─── 요약 모달 ────────────────────────────────────────────────────────────
  'summary.title': '온톨로지 요약',
  'summary.copyToClipboard': '클립보드에 복사',

  // ─── 데이터 소스 모달 ─────────────────────────────────────────────────────
  'dataSources.title': '데이터 소스',
  'dataSources.lakehouse': '데이터 레이크하우스',
  'dataSources.sourceTable': '원본 테이블:',
  'dataSources.property': '속성',
  'dataSources.column': '열',
  'dataSources.otherEntityTypes': '그 밖의 엔티티 유형:',

  // ─── 질의 영역 ────────────────────────────────────────────────────────────
  'query.clear': '지우기',
  'query.clearLabel': '질의 지우기',
  'query.runLabel': '질의 실행',
  'query.title': '자연어 질의 (NL2Ontology)',
  'query.tryAsking': '이렇게 물어보십시오:',
  'graph.zoomIn': '확대',
  'graph.zoomOut': '축소',
  'graph.fit': '화면에 맞추기',
  'graph.reset': '배치 초기화',
  'graph.downloadPng': '그래프를 PNG 로 내려받기',
  'graph.focusMode': '집중 모드',
  'graph.legendTitle': '엔티티 유형',
  'learn.previous': '이전',
  'learn.next': '다음',
  'query.askAbout': '{name} 에 대해 물어보십시오...',
  'quest.beginner': '입문',
  'quest.intermediate': '중급',
  'quest.advanced': '고급',

  // ─── 둘러보기 ─────────────────────────────────────────────────────────────
  'tour.closeLabel': '둘러보기 닫기',
  'tour.next': '다음',
  'tour.getStarted': '시작하기',
  'tour.skip': '둘러보기 건너뛰기 · 다시 보지 않기',
  'tour.graphTitle': '온톨로지 그래프',
  'tour.graphText':
    '온톨로지를 대화형 그래프로 나타낸 화면입니다. 엔티티 원이나 관계 선을 누르면 자세히 볼 수 있습니다.',
  'tour.questsTitle': '퀘스트',
  'tour.questsText':
    '안내에 따라 퀘스트를 완료하며 온톨로지 개념을 단계별로 익히십시오. 배지와 점수를 얻습니다.',
  'tour.inspectorTitle': '인스펙터와 질의',
  'tour.inspectorText':
    '엔티티를 고르면 속성과 데이터 연결이 보입니다. 아래 질의 막대에서 자연어로 질문할 수 있습니다.',
  'tour.designerTitle': '온톨로지 디자이너',
  'tour.designerText':
    '온톨로지를 처음부터 만들거나 템플릿으로 시작하십시오. RDF 로 내보내거나 커뮤니티 카탈로그에 제출할 수 있습니다.',
  'tour.navTitle': '이동과 동작',
  'tour.navText':
    '툴바에서 카탈로그·디자이너·학습 문서·가져오기/내보내기 등을 쓸 수 있습니다. ⌘K 를 누르면 명령 팔레트가 열립니다.',

  // ─── Fabric 내보내기 ──────────────────────────────────────────────────────
  'fabric.title': 'Microsoft Fabric 으로 보내기',
  'fabric.connect': '작업 영역에 연결',
  'fabric.tokenPlaceholder': '베어러 토큰을 여기에 붙여넣으십시오',
  'fabric.workspacePlaceholder': '00000000-0000-0000-0000-000000000000',
  'fabric.bothRequired': '토큰과 작업 영역 ID 가 모두 필요합니다.',
  'fabric.invalidWorkspace':
    '작업 영역 ID 는 올바른 UUID 여야 합니다 (예: cfafbeb1-8037-4d0c-896e-a46fb27ff229).',
  'fabric.connectFailed': '작업 영역에 연결하지 못했습니다',
  'fabric.createAndPush': '만들고 보내기',
  'fabric.creating': 'Fabric 에 온톨로지를 만드는 중…',
  'fabric.created': '온톨로지를 만들었습니다',
  'fabric.updateDefinition': '정의 업데이트',
  'fabric.updating': '온톨로지 정의를 업데이트하는 중…',
  'fabric.updated': '정의를 업데이트했습니다',
  'fabric.pushFailed': '보내기에 실패했습니다',
  'fabric.workspace': '작업 영역:',
  'fabric.name': '이름:',
  'fabric.id': 'ID:',
  'fabric.subtitle': 'Fabric 작업 영역에 온톨로지를 만들거나 업데이트합니다',
  'fabric.summary': '엔티티 유형 {entities}개, 관계 {relationships}개',
  'fabric.workspaceId': '작업 영역 ID',
  'fabric.workspaceHint': 'Fabric 포털 → 작업 영역 설정 → 개요 에서 확인할 수 있습니다',
  'fabric.accessToken': '액세스 토큰',
  'fabric.connecting': '연결하는 중…',
  'fabric.action': '동작',
  'fabric.createNew': '새로 만들기',
  'fabric.selectOntology': '온톨로지 선택',
  'fabric.mayTakeAMoment': 'Fabric 이 리소스를 준비하는 동안 잠시 걸릴 수 있습니다.',
  'fabric.pushFailedRetry': '보내기에 실패했습니다. 위 오류를 확인하고 다시 시도하십시오.',
  'fabric.startOver': '처음부터 다시',

  // ─── 자연어 빌더 ──────────────────────────────────────────────────────────
  'nl.describeTitle': '온톨로지를 설명하십시오',
  'nl.placeholder': '업무 상황을 설명하십시오...',
  'nl.tryExample': '예시를 써 보십시오:',
  'nl.analyzing': '설명을 분석하는 중…',
  'nl.generationFailed': '생성에 실패했습니다',
  'nl.editJson': 'JSON 편집',
  'nl.preview': '미리보기',
  'nl.invalidJson': '편집기의 JSON 이 올바르지 않습니다',
  'nl.generateFailed': '온톨로지를 생성하지 못했습니다',
  'nl.unknownError': '알 수 없는 오류가 발생했습니다',
  'nl.startVoice': '음성 입력 시작',
  'nl.stopRecording': '녹음 중지',
  'nl.micDenied': '마이크 사용이 거부되었습니다',
  'nl.speechUnsupported': '음성 인식을 지원하지 않습니다',
  'nl.speechNetwork': '네트워크 오류 — Chrome 이나 Safari 를 써 보십시오',
  'nl.speechStartFailed': '시작하지 못했습니다 — Chrome 이나 Safari 를 써 보십시오',
  'nl.generateOntology': '온톨로지 생성',
  'nl.entities': '엔티티 ({count})',
  'nl.relationships': '관계 ({count})',
  'nl.backArrow': '← 뒤로',
  'nl.applyOntology': '온톨로지 적용',
  'nl.tryAgain': '다시 시도',

  // ─── 퀘스트 ───────────────────────────────────────────────────────────────
  'quest.title': '퀘스트',
  'quest.abandon': '중단',
  'quest.points': '+{count}점',
  'quest.earnedBadges': '획득한 배지 ({count})',
  'quest.total': '합계: {count}점',

  // ─── 도움말 모달 ──────────────────────────────────────────────────────────
  'help.title': 'Ontology Playground (미리보기) 사용법',
  'help.exploreTitle': '그래프 살펴보기',
  'help.exploreText':
    '엔티티 유형(색이 있는 원)을 누르면 속성·관계·데이터 연결을 볼 수 있습니다. 관계 선을 누르면 엔티티가 어떻게 이어지는지 보입니다. 왼쪽 아래 조작부로 확대·축소하거나 배치를 초기화할 수 있습니다.',
  'help.questsTitle': '퀘스트 완료하기',
  'help.questsText':
    '왼쪽 패널에서 퀘스트를 고르면 안내에 따라 진행합니다. 지시대로 특정 엔티티나 관계를 누르고, 모든 단계를 마치면 배지와 점수를 얻습니다.',
  'help.nlTitle': '자연어로 질문하기',
  'help.nlText':
    '오른쪽 아래 질의 영역에서 "Show me Gold tier customers" 같은 질문을 해 보십시오. 관련된 엔티티와 관계가 그래프에서 강조됩니다.',
  'help.bindingsTitle': '데이터 연결 보기',
  'help.bindingsText':
    '엔티티 유형을 고르면, 온톨로지 속성이 데이터 레이크하우스의 실제 데이터 원본(레이크하우스 테이블·시맨틱 모델)에 어떻게 대응되는지 인스펙터에 표시됩니다.',
  'help.aboutFabricTitle': 'Microsoft Fabric IQ 온톨로지 소개',
  'help.aboutFabricText':
    '온톨로지는 업무를 기계가 이해할 수 있게 공유하는 어휘 체계입니다. 엔티티 유형(고객·상품 등)과 그 속성, 관계를 정의합니다. 이 데모는 가상의 "Fourth Coffee" 로 개념을 설명합니다.',
  'help.shortcutsTitle': '단축키',
  'help.shortcutPalette': '명령 팔레트 열기',
  'help.shortcutHelp': '이 도움말 열기',
  'help.shortcutEsc': '대화상자 닫기',
  'help.shortcutNavigate': '팔레트 결과 이동',
  'help.shortcutSelect': '팔레트 명령 실행',
  'help.gotIt': '알겠습니다',

  // ─── 정보 모달 ────────────────────────────────────────────────────────────
  'about.title': 'Ontology Playground 정보',
  'about.closeLabel': '정보 대화상자 닫기',
  'about.intro':
    'Ontology Playground 는 RDF/OWL 온톨로지를 만들고, 그래프 관계를 살펴보고, Microsoft Fabric IQ 워크플로에 맞는 모델을 준비하기 위한 커뮤니티 학습·설계 도구입니다.',
  'about.learnMore': 'Microsoft Fabric IQ 자세히 보기:',
  'about.trademarkTitle': '상표 고지',
  'about.trademarkText':
    '이 프로젝트에는 프로젝트·제품·서비스의 상표나 로고가 포함될 수 있습니다. Microsoft 상표 또는 로고의 사용은 Microsoft 상표 및 브랜드 지침을 따라야 합니다. 이 프로젝트를 수정한 버전에서 Microsoft 상표나 로고를 쓸 때 혼동을 일으키거나 Microsoft 의 후원을 암시해서는 안 됩니다. 제3자 상표·로고의 사용은 해당 제3자의 정책을 따릅니다.',

  // ─── 환영 모달 ────────────────────────────────────────────────────────────
  'welcome.title': 'Ontology Playground (미리보기) 에 오신 것을 환영합니다',
  'welcome.subtitle': 'Fourth Coffee 예제로 Microsoft Fabric IQ 온톨로지를 살펴보십시오',
  'welcome.entityTypes': '엔티티 유형',
  'welcome.entityTypesText': '고객·상품·주문처럼 재사용 가능한 논리 모델을 확인하십시오',
  'welcome.relationships': '관계',
  'welcome.relationshipsText': '엔티티가 방향과 유형을 가진 연결로 어떻게 이어지는지 보십시오',
  'welcome.bindings': '데이터 연결',
  'welcome.bindingsText': '온톨로지 개념을 실제 데이터 플랫폼 원본과 이어 보십시오',
  'welcome.nlQueries': '자연어 질의',
  'welcome.nlQueriesText': '자연어로 질문하고 그래프를 따라가 보십시오',
  'welcome.start': '살펴보기 시작',
  'welcome.footer': '퀘스트를 완료해 배지를 얻고 Microsoft Fabric IQ 온톨로지를 익히십시오',

  // ─── 명령 팔레트 ──────────────────────────────────────────────────────────
  'palette.placeholder': '명령을 입력하십시오…',
  'palette.noResults': '일치하는 명령이 없습니다',

  // ─── 명령 팔레트 항목 ─────────────────────────────────────────────────────
  'cmd.catalogue': '카탈로그 열기',
  'cmd.designer': '디자이너 열기',
  'cmd.learn': '온톨로지 학습 열기',
  'cmd.importExport': '가져오기 / 내보내기',
  'cmd.summary': '요약 보기',
  'cmd.about': '정보 및 상표 고지',
  'cmd.help': '도움말',
  'cmd.dataSources': '데이터 소스',
  'cmd.theme': '테마 전환',

  // ─── 온톨로지 학습 (화면 골격만 — 본문은 영문 유지) ───────────────────────
  'learn.title': '온톨로지 학습',
  'learn.allCourses': '전체 과정',
  'learn.playground': '플레이그라운드',
  'learn.backTo': '{label} (으)로 돌아가기',
  'learn.toggleTheme': '테마 전환',
  'learn.startLab': '실습 시작',
  'learn.startLearning': '학습 시작',
  'learn.lab': '실습',
  'learn.learningPath': '학습 경로',
  'learn.overview': '개요',
  'learn.step': '{n}단계',
  'learn.openStep': '단계 열기',
  'learn.readArticle': '문서 읽기',
  'learn.present': '발표',
  'learn.presentTitle': '슬라이드로 발표',
  'learn.catalogueLoadFailed': '카탈로그를 불러오지 못했습니다',
  'learn.prevSlide': '이전 슬라이드',
  'learn.nextSlide': '다음 슬라이드',
  'learn.prevNamed': '이전: {title}',
  'learn.nextNamed': '다음: {title}',
  'learn.before': '이전',
  'learn.after': '이후',
  'learn.toggleFullscreen': '전체 화면 전환',
  'learn.heroText': 'Microsoft Fabric IQ 용 온톨로지를 이해하고 만드는 데 필요한 학습 경로와 실습입니다.',
  'learn.path': '학습 경로',
  'learn.steps': '단계',
  'learn.articles': '문서',
  'learn.underReview': '🔍 사람이 검토 중',
  'learn.loading': '불러오는 중…',
  'learn.loadFailed': '학습 콘텐츠를 불러오지 못했습니다: {error}',

  // ─── 인스펙터 ─────────────────────────────────────────────────────────────
  'inspector.title': '인스펙터',
  'inspector.selectElement': '요소를 선택하십시오',
  'inspector.selectElementHint':
    '그래프에서 엔티티 유형이나 관계를 누르면 속성·데이터 연결·연결 관계를 볼 수 있습니다.',
  'inspector.relationship': '관계',
  'inspector.entityType': '엔티티 유형',
  'inspector.cardinality': '대응 관계',
  'inspector.relationshipAttributes': '관계 속성',
  'inspector.properties': '속성 ({count})',
  'inspector.relationships': '관계 ({count})',
  'inspector.dataBindings': '데이터 연결',

  // ─── 검색·필터 ────────────────────────────────────────────────────────────
  'search.title': '검색 및 필터',
  'search.placeholder': '엔티티·속성 검색...',
  'search.results': '검색 결과',
  'search.entitiesToggle': '엔티티 ({count})',
  'search.relationshipsToggle': '관계 ({count})',
  'search.noResults': '"{query}" 에 대한 결과가 없습니다',
  'search.propertiesCount': '속성 {count}개',

  // ─── 통계 패널 ────────────────────────────────────────────────────────────
  'stats.title': '온톨로지 현황',
  'stats.entities': '엔티티',
  'stats.relationships': '관계',
  'stats.properties': '속성',

  // ─── 경로 탐색 ────────────────────────────────────────────────────────────
  'pathfinder.title': '경로 찾기',
  'pathfinder.selectEntity': '엔티티 선택…',
  'pathfinder.findPath': '경로 찾기',
  'pathfinder.clear': '지우기',
  'pathfinder.sameEntity': '서로 다른 엔티티를 두 개 고르십시오.',
  'pathfinder.noPath': '두 엔티티 사이에 방향 경로가 없습니다.',
  'pathfinder.shortestPath': '최단 경로 — {count}단계',
  'pathfinder.shortestPath_plural': '최단 경로 — {count}단계',

  // ─── 푸터 ─────────────────────────────────────────────────────────────────
  'footer.builtWith': 'GitHub Copilot 으로 제작',
  'footer.supervisedBy': '감수 videlalvaro',
  'footer.deployedCommit': '배포 커밋 {sha}',

  // ─── 디자이너 — 화면 골격 ─────────────────────────────────────────────────
  'designer.ontologyNamePlaceholder': '온톨로지 이름',
  'designer.descriptionPlaceholder': '설명',

  // ─── 디자이너 — 툴바 ──────────────────────────────────────────────────────
  'designer.undo': '실행 취소 (Ctrl+Z)',
  'designer.redo': '다시 실행 (Ctrl+Shift+Z)',
  'designer.new': '새로 만들기',
  'designer.newTitle': '새 온톨로지',
  'designer.validate': '검증',
  'designer.validateTitle': '온톨로지 검증',
  'designer.exportRdf': 'RDF 내보내기',
  'designer.loadInPlayground': '플레이그라운드에서 열기',
  'designer.submitToCatalogue': '카탈로그에 제출',
  'designer.submitToCatalogueTitle': '커뮤니티 카탈로그에 제출',
  'designer.namingAnyScript': '모든 문자 허용',
  'designer.namingFabric': 'Fabric IQ 이름 규칙',
  'designer.namingAnyScriptTitle':
    '한글·일본어 등 모든 문자를 이름에 쓸 수 있습니다. 누르면 Fabric IQ 이름 규칙을 강제합니다.',
  'designer.namingFabricTitle':
    'Fabric IQ 엄격 모드입니다 — 이름은 영숫자 1~26자여야 합니다. 누르면 모든 문자를 허용합니다.',

  // ─── 디자이너 — 검증 패널 ─────────────────────────────────────────────────
  'designer.noIssues': '문제가 없습니다',
  'designer.issuesToFix': '수정할 항목 {count}건',
  'designer.issuesToFix_plural': '수정할 항목 {count}건',
  'designer.fabricWarnings': 'Fabric IQ 경고 {count}건',
  'designer.fabricWarnings_plural': 'Fabric IQ 경고 {count}건',

  // ─── 디자이너 — 엔티티 ────────────────────────────────────────────────────
  'designer.entityTypes': '엔티티 유형 ({count})',
  'designer.addEntityType': '엔티티 유형 추가',
  'designer.noEntities': '아직 엔티티 유형이 없습니다. "추가"를 눌러 만드십시오.',
  'designer.deleteEntity': '엔티티 삭제',
  'designer.propsBadge': '속성 {count}개',
  'designer.entityNamePlaceholder': '엔티티 이름',
  'designer.entityDescriptionPlaceholder': '이 엔티티는 무엇을 나타냅니까?',
  'designer.icon': '아이콘',
  'designer.color': '색상',
  'designer.colorSwatch': '색상 {color}',
  'designer.properties': '속성 ({count})',
  'designer.dragToReorder': '끌어서 순서 변경',
  'designer.propertyNamePlaceholder': '속성 이름',
  'designer.markAsIdentifier': '식별자로 지정',
  'designer.removeAsIdentifier': '식별자 지정 해제',
  'designer.removeProperty': '속성 삭제',
  'designer.identifierTypeHint': '식별자는 string 또는 integer 여야 합니다 (현재 {type}).',

  // ─── 디자이너 — 관계 ──────────────────────────────────────────────────────
  'designer.relationships': '관계 ({count})',
  'designer.addRelationship': '관계 추가',
  'designer.needEntityForRelationship': '관계를 추가하려면 엔티티가 하나 이상 있어야 합니다',
  'designer.createEntityFirst': '엔티티를 먼저 하나 이상 만드십시오.',
  'designer.noRelationships': '아직 관계가 없습니다. "추가"를 눌러 만드십시오.',
  'designer.deleteRelationship': '관계 삭제',
  'designer.relationshipNamePlaceholder': '관계 이름',
  'designer.from': '출발',
  'designer.to': '도착',
  'designer.cardinality': '대응 관계',
  'designer.relationshipDescriptionPlaceholder': '이 관계를 설명하십시오',
  'designer.attributes': '관계 속성 ({count})',
  'designer.attributeNamePlaceholder': '속성 이름',
  'designer.attributeTypePlaceholder': '자료형',
  'designer.removeAttribute': '관계 속성 삭제',

  // ─── 디자이너 — 템플릿 ────────────────────────────────────────────────────
  'designer.templateHeading': '템플릿으로 시작하기',
  'designer.templateSubheading': '분야를 골라 바로 시작하거나, 엔티티를 직접 추가하십시오.',

  'template.retail': '유통',
  'template.retailDesc': '고객·상품·주문',
  'template.healthcare': '보건의료',
  'template.healthcareDesc': '환자·의료진·진료',
  'template.finance': '금융',
  'template.financeDesc': '계좌·거래·거래상대',
  'template.iot': '사물인터넷',
  'template.iotDesc': '기기·센서·측정값',
  'template.education': '교육',
  'template.educationDesc': '학생·과목·수강',

  // ─── 디자이너 — RDF 패널 ──────────────────────────────────────────────────
  'designer.tabGraph': '그래프',
  'designer.tabRdf': 'RDF',
  'designer.editRdf': 'RDF 편집',
  'designer.copyRdf': 'RDF 복사',
  'designer.loadIntoDesigner': '디자이너로 불러오기',
  'designer.pasteRdfFirst': 'RDF/XML 내용을 먼저 붙여넣으십시오',
  'designer.failedToParseRdf': 'RDF 를 해석하지 못했습니다',
  'designer.rdfPlaceholder': 'RDF/XML 내용을 여기에 붙여넣거나 편집하십시오…',

  // ─── 디자이너 — 제출 모달 ─────────────────────────────────────────────────
  'submit.title': '카탈로그에 제출',
  'submit.description':
    '만든 온톨로지를 커뮤니티와 공유하십시오. 아래 파일을 내려받은 뒤 다음 저장소에 풀 리퀘스트를 여십시오 —',
  'submit.repoLink': 'Ontology Playground 저장소',
  'submit.howTo': '제출 방법',
  'submit.step1': '아래에서 온톨로지 RDF 와 메타데이터 파일을 내려받습니다.',
  'submit.step2': '저장소를 포크합니다',
  'submit.step3': '다음 경로에 파일을 넣습니다 —',
  'submit.step4': 'metadata.json 을 열어 이름·분류·태그를 채웁니다.',
  'submit.step5': 'main 브랜치를 대상으로 풀 리퀘스트를 엽니다.',
  'submit.downloadRdf': 'RDF 내려받기',
  'submit.downloadMetadata': 'metadata.json 내려받기',

  // ─── 검증 메시지 ──────────────────────────────────────────────────────────
  'validation.kind.entityType': '엔티티 유형',
  'validation.kind.property': '속성',
  'validation.unnamedEntity': '이름 없는 엔티티',
  'validation.unnamedRelationship': '이름 없는 관계',

  'validation.needEntity': '엔티티 유형을 하나 이상 추가하십시오.',
  'validation.missingId': '"{label}" 에 내부 ID 가 없습니다.',
  'validation.duplicateEntityId': '두 엔티티가 같은 ID "{id}" 를 씁니다. 하나를 바꾸십시오.',
  'validation.entityHasNoName': '이름이 없는 엔티티가 있습니다. 이름을 지정하십시오.',
  'validation.noIdentifier':
    '"{label}" 에 식별자 속성이 없습니다. 속성 중 하나의 열쇠 아이콘(🔑)을 눌러 고유 식별자로 지정하십시오.',
  'validation.identifierType':
    '"{label}" 의 식별자 속성 "{name}" 은 Fabric IQ 호환을 위해 string 또는 integer 여야 합니다.',
  'validation.propertyTypeConflict':
    '속성 "{name}" 이 "{label}" 에서는 "{type}", "{otherLabel}" 에서는 "{otherType}" 로 정의되어 있습니다. Fabric IQ 는 엔티티 유형 간에 속성 이름이 같으면 자료형도 같기를 요구합니다.',
  'validation.duplicateRelationshipId': '두 관계가 같은 ID "{id}" 를 씁니다. 하나를 바꾸십시오.',
  'validation.danglingFrom':
    '"{label}" 의 출발점 "{from}" 이 존재하지 않습니다. 올바른 출발 엔티티를 고르십시오.',
  'validation.danglingTo':
    '"{label}" 의 도착점 "{to}" 이 존재하지 않습니다. 올바른 도착 엔티티를 고르십시오.',

  'validation.nameExceeds': '{kind} 이름 "{name}" 이 {max}자를 초과합니다.',
  'validation.nameMustStart': '{kind} 이름 "{name}" 은 문자나 숫자로 시작해야 합니다.',
  'validation.nameMustEnd': '{kind} 이름 "{name}" 은 문자나 숫자로 끝나야 합니다.',
  'validation.nameCharsFabric':
    '{kind} 이름 "{name}" 에는 영문자·숫자·하이픈·밑줄만 쓸 수 있습니다.',
  'validation.nameNoPadding': '{kind} 이름 "{name}" 은 앞뒤에 공백을 둘 수 없습니다.',
  'validation.nameCharsUnicode':
    '{kind} 이름 "{name}" 에는 문자·숫자·공백과 _ - ( ) · . / 만 쓸 수 있습니다.',
  'validation.fabricSuffix': '{message} (Fabric IQ 호환 관련 — 로컬에서는 필수가 아닙니다.)',
};
