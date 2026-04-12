import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, Sun, Moon, FlaskConical, GraduationCap, Play, X } from 'lucide-react';
import { AppFooter } from './AppFooter';
import { useAppStore } from '../store/appStore';
import { navigate } from '../lib/router';
import type { Route } from '../lib/router';
import type { LearnManifest, LearnCourse, LearnArticle } from '../types/learn';
import type { Catalogue } from '../types/catalogue';
import type { Core as CytoscapeCore, StylesheetCSS, LayoutOptions } from 'cytoscape';

interface LearnPageProps {
  route: Route & { page: 'learn' };
}

export function LearnPage({ route }: LearnPageProps) {
  const { darkMode, toggleDarkMode } = useAppStore();
  const [manifest, setManifest] = useState<LearnManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // Scroll to top when navigating
  useEffect(() => {
    pageRef.current?.scrollTo(0, 0);
  }, [route.courseSlug, route.articleSlug]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}learn.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        return res.json() as Promise<LearnManifest>;
      })
      .then(setManifest)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className={`learn-page ${darkMode ? '' : 'light-theme'}`}>
        <div className="learn-error">Failed to load learning content: {error}</div>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className={`learn-page ${darkMode ? '' : 'light-theme'}`}>
        <div className="learn-loading">Loading…</div>
      </div>
    );
  }

  const course = route.courseSlug
    ? manifest.courses.find((c) => c.slug === route.courseSlug)
    : null;

  const article = course && route.articleSlug
    ? course.articles.find((a) => a.slug === route.articleSlug)
    : null;

  // Determine back button behavior
  let backLabel: string;
  let backAction: () => void;
  if (article && course) {
    backLabel = course.title;
    backAction = () => navigate({ page: 'learn', courseSlug: course.slug });
  } else if (course) {
    backLabel = 'All courses';
    backAction = () => navigate({ page: 'learn' });
  } else {
    backLabel = 'Playground';
    backAction = () => navigate({ page: 'home' });
  }

  return (
    <div ref={pageRef} className={`learn-page ${darkMode ? '' : 'light-theme'}`}>
      <header className="learn-header">
        <button
          className="learn-back-btn"
          onClick={backAction}
          title={`Back to ${backLabel}`}
        >
          <ArrowLeft size={20} />
          <span>{backLabel}</span>
        </button>
        <button className="learn-header-title" onClick={() => navigate({ page: 'learn' })}>
          <BookOpen size={20} />
          <span>Ontology School</span>
        </button>
        <button className="icon-btn" onClick={toggleDarkMode} title="Toggle Theme">
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>

      {article && course ? (
        <ArticleView key={article.slug} article={article} course={course} darkMode={darkMode} />
      ) : course ? (
        <CourseDetail course={course} />
      ) : (
        <CourseCatalogue courses={manifest.courses} />
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// Course Catalogue (top-level index)
// -------------------------------------------------------------------

function CourseCatalogue({ courses }: { courses: LearnCourse[] }) {
  return (
    <div className="learn-index">
      <div className="learn-index-hero">
        <p>
          Learning paths and hands-on labs to help you understand and build
          ontologies for Microsoft Fabric IQ.
        </p>
      </div>
      <div className="learn-card-grid">
        {courses.map((c) => (
          <button
            key={c.slug}
            className="learn-card"
            onClick={() => navigate({ page: 'learn', courseSlug: c.slug })}
          >
            <div className="learn-card-header">
              <span className="learn-card-icon">{c.icon}</span>
              <span className={`learn-card-badge learn-card-badge--${c.type}`}>
                {c.type === 'lab' ? <FlaskConical size={12} /> : <GraduationCap size={12} />}
                {c.type === 'lab' ? 'Lab' : 'Path'}
              </span>
            </div>
            <h2>{c.title}</h2>
            <p>{c.description}</p>
            <span className="learn-card-meta">
              {c.articles.length} {c.type === 'lab' ? 'steps' : 'articles'}
            </span>
            <span className="learn-card-cta">
              {c.type === 'lab' ? 'Start lab' : 'Start learning'} <ChevronRight size={16} />
            </span>
          </button>
        ))}
      </div>
      <AppFooter />
    </div>
  );
}

function CourseDetail({ course }: { course: LearnCourse }) {
  return (
    <div className="learn-index">
      <div className="learn-index-hero">
        <div className="learn-course-header">
          <span className="learn-course-icon">{course.icon}</span>
          <span className={`learn-card-badge learn-card-badge--${course.type}`}>
            {course.type === 'lab' ? <FlaskConical size={12} /> : <GraduationCap size={12} />}
            {course.type === 'lab' ? 'Lab' : 'Learning Path'}
          </span>
        </div>
        <h1>{course.title}</h1>
        <p>{course.description}</p>
      </div>
      <div className="learn-card-grid">
        {course.articles.map((a) => (
          <button
            key={a.slug}
            className="learn-card"
            onClick={() => navigate({ page: 'learn', courseSlug: course.slug, articleSlug: a.slug })}
          >
            <span className="learn-card-order">
              {course.type === 'lab' ? (a.order === 1 ? 'Overview' : `Step ${a.order - 1}`) : a.order}
            </span>
            <h2>{a.title}</h2>
            {a.reviewStatus === 'under-human-review' && (
              <span className="learn-card-review-badge">🔍 Under human review</span>
            )}
            <p>{a.description}</p>
            <span className="learn-card-cta">
              {course.type === 'lab' ? 'Open step' : 'Read article'} <ChevronRight size={16} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Article View
// -------------------------------------------------------------------

function ArticleView({
  article,
  course,
  darkMode,
}: {
  article: LearnArticle;
  course: LearnCourse;
  darkMode: boolean;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  // Auto-open presentation if URL has ?slide= param
  const [presenting, setPresenting] = useState(() => {
    const hash = window.location.hash;
    return /[?&]slide=/.test(hash);
  });

  const nextArticle = useMemo(
    () => course.articles.find((a) => a.order === article.order + 1),
    [course.articles, article.order],
  );
  const prevArticle = useMemo(
    () => course.articles.find((a) => a.order === article.order - 1),
    [course.articles, article.order],
  );

  // Replace <ontology-embed> placeholders with live widgets
  useEffect(() => {
    if (!contentRef.current) return;
    const placeholders = contentRef.current.querySelectorAll('ontology-embed');
    for (const el of placeholders) {
      const id = el.getAttribute('id');
      const height = el.getAttribute('height') || '400px';
      const diff = el.getAttribute('diff') || '';
      if (!id) continue;
      const wrapper = document.createElement('div');
      wrapper.className = 'learn-embed-slot';
      wrapper.style.height = height;
      wrapper.dataset.catalogueId = id;
      wrapper.dataset.theme = darkMode ? 'dark' : 'light';
      if (diff) wrapper.dataset.diffId = diff;
      el.replaceWith(wrapper);
    }
  }, [article.slug, darkMode]);

  // Hydrate embed slots with real ontology data
  useEffect(() => {
    if (!contentRef.current) return;

    const slots = contentRef.current.querySelectorAll<HTMLElement>('.learn-embed-slot');
    if (slots.length === 0) return;

    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}catalogue.json`)
      .then((res) => res.json() as Promise<Catalogue>)
      .then((catalogue) => {
        if (cancelled) return;
        for (const slot of slots) {
          const id = slot.dataset.catalogueId;
          const diffId = slot.dataset.diffId;
          const entry = catalogue.entries.find((e) => e.id === id);
          if (!entry) {
            slot.innerHTML = `<div class="learn-embed-error">Ontology "${id}" not found in catalogue</div>`;
            continue;
          }
          // Find the previous-step entry for diff
          const prevEntry = diffId ? catalogue.entries.find((e) => e.id === diffId) : undefined;

          // Compute diff: which entity/relationship IDs are new vs the previous step
          let newEntityIds: Set<string> | undefined;
          let newRelIds: Set<string> | undefined;
          if (prevEntry) {
            const prevEntIds = new Set(prevEntry.ontology.entityTypes.map((et) => et.id));
            const prevRelIds = new Set(prevEntry.ontology.relationships.map((r) => r.id));
            newEntityIds = new Set(entry.ontology.entityTypes.filter((et) => !prevEntIds.has(et.id)).map((et) => et.id));
            newRelIds = new Set(entry.ontology.relationships.filter((r) => !prevRelIds.has(r.id)).map((r) => r.id));
          }
          renderEmbedSlot(slot, entry, darkMode, newEntityIds, newRelIds, prevEntry);
        }
      })
      .catch(() => {
        if (cancelled) return;
        for (const slot of slots) {
          slot.innerHTML = '<div class="learn-embed-error">Failed to load catalogue</div>';
        }
      });
    return () => { cancelled = true; };
  }, [article.slug, darkMode]);

  return (
    <div className="learn-article">
      <div className="learn-article-toolbar">
        <button
          className="learn-present-btn"
          onClick={() => setPresenting(true)}
          title="Present as slides"
        >
          <Play size={16} />
          <span>Present</span>
        </button>
      </div>
      <ArticleContent article={article} contentRef={contentRef} />
      {presenting && (
        <PresentationMode
          article={article}
          darkMode={darkMode}
          nextArticle={nextArticle}
          prevArticle={prevArticle}
          courseSlug={course.slug}
          onClose={() => {
            setPresenting(false);
            // Strip ?slide= from the URL
            const hash = window.location.hash.replace(/[?&]slide=\d+/, '');
            history.replaceState(null, '', hash || '#/');
          }}
        />
      )}
      <nav className="learn-article-nav">
        {prevArticle ? (
          <button
            className="learn-nav-btn learn-nav-prev"
            onClick={() => navigate({ page: 'learn', courseSlug: course.slug, articleSlug: prevArticle.slug })}
          >
            <ArrowLeft size={16} />
            <div>
              <span className="learn-nav-label">Previous</span>
              <span className="learn-nav-title">{prevArticle.title}</span>
            </div>
          </button>
        ) : (
          <div />
        )}
        {nextArticle && (
          <button
            className="learn-nav-btn learn-nav-next"
            onClick={() => navigate({ page: 'learn', courseSlug: course.slug, articleSlug: nextArticle.slug })}
          >
            <div>
              <span className="learn-nav-label">Next</span>
              <span className="learn-nav-title">{nextArticle.title}</span>
            </div>
            <ChevronRight size={16} />
          </button>
        )}
      </nav>
    </div>
  );
}

// -------------------------------------------------------------------
// Article content — renders HTML segments with inline quiz components
// -------------------------------------------------------------------

function ArticleContent({
  article,
  contentRef,
}: {
  article: LearnArticle;
  contentRef: React.RefObject<HTMLDivElement | null>;
}) {
  const segments = useMemo(() => splitArticleSegments(article.html), [article.html]);

  return (
    <article className="learn-article-content" ref={contentRef}>
      <h1>{article.title}</h1>
      {segments.map((seg, i) =>
        seg.type === 'quiz' ? (
          <QuizSlide quiz={seg.quiz} key={`quiz-${i}`} />
        ) : (
          <div key={`content-${i}`} dangerouslySetInnerHTML={{ __html: seg.html }} />
        ),
      )}
    </article>
  );
}

// -------------------------------------------------------------------
// Quiz React component – pure React, no DOM manipulation
// -------------------------------------------------------------------

export interface QuizOption { text: string; correct: boolean }
export interface QuizData { question: string; options: QuizOption[]; explanation: string }

const LETTERS = 'ABCDEFGHIJ';

export function QuizSlide({ quiz }: { quiz: QuizData }) {
  const [answered, setAnswered] = useState<number | null>(null);
  const chose = answered !== null;
  const isCorrect = chose && quiz.options[answered].correct;

  return (
    <div className="quiz-block quiz-interactive">
      <div className="quiz-header">
        <span className="quiz-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </span>
        <span className="quiz-question">{quiz.question}</span>
      </div>
      <div className="quiz-options">
        {quiz.options.map((opt, i) => {
          let cls = 'quiz-option';
          if (chose) {
            if (opt.correct) cls += ' quiz-option--correct';
            else if (i === answered) cls += ' quiz-option--wrong';
            else cls += ' quiz-option--dimmed';
          }
          return (
            <button
              key={i}
              className={cls}
              disabled={chose}
              onClick={() => setAnswered(i)}
            >
              <span className="quiz-option-letter">{LETTERS[i]}</span>
              <span className="quiz-option-text">{opt.text}</span>
            </button>
          );
        })}
      </div>
      {chose && (
        <div className={`quiz-result ${isCorrect ? 'quiz-result--correct' : 'quiz-result--wrong'}`}>
          {isCorrect
            ? <><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Correct!</>
            : <><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Not quite</>}
        </div>
      )}
      {chose && quiz.explanation && (
        <div className="quiz-explanation">{quiz.explanation}</div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// Presentation mode — splits article HTML into slides at <h2> boundaries
// -------------------------------------------------------------------

export type Slide = { type: 'content'; html: string } | { type: 'quiz'; quiz: QuizData };

/** Extract QuizData from a quiz-block element's data-quiz attribute.
 *  The attribute value is HTML-entity-encoded JSON. */
export function extractQuizData(el: HTMLElement): QuizData | null {
  const raw = el.getAttribute('data-quiz');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as QuizData;
  } catch {
    return null;
  }
}

/** Split compiled HTML into slides. Each <h2> starts a new slide.
 *  Content before the first <h2> becomes the title slide.
 *  An <hr> within a section also creates an additional split.
 *  A .quiz-block div gets its own dedicated quiz slide. */
export function splitIntoSlides(html: string, title: string): Slide[] {
  const container = document.createElement('div');
  container.innerHTML = html;
  const slides: Slide[] = [];
  let currentSlide = document.createElement('div');

  const titleSlide = document.createElement('div');
  titleSlide.innerHTML = `<h1>${title}</h1>`;

  const flushContent = (content: string) => {
    if (!content) return;
    if (slides.length === 0) {
      titleSlide.innerHTML += content;
    } else {
      slides.push({ type: 'content', html: content });
    }
  };

  const ensureTitleFlushed = () => {
    if (slides.length === 0) {
      slides.push({ type: 'content', html: titleSlide.innerHTML });
    }
  };

  for (const child of Array.from(container.childNodes)) {
    const el = child as HTMLElement;
    if (el.nodeType === Node.ELEMENT_NODE && el.tagName === 'H2') {
      flushContent(currentSlide.innerHTML.trim());
      ensureTitleFlushed();
      currentSlide = document.createElement('div');
      currentSlide.appendChild(el.cloneNode(true));
    } else if (el.nodeType === Node.ELEMENT_NODE && el.tagName === 'HR') {
      const content = currentSlide.innerHTML.trim();
      if (content) slides.push({ type: 'content', html: content });
      currentSlide = document.createElement('div');
    } else if (
      el.nodeType === Node.ELEMENT_NODE &&
      el.classList?.contains('quiz-block')
    ) {
      flushContent(currentSlide.innerHTML.trim());
      ensureTitleFlushed();
      const quiz = extractQuizData(el);
      if (quiz) {
        slides.push({ type: 'quiz', quiz });
      }
      currentSlide = document.createElement('div');
    } else {
      currentSlide.appendChild(el.cloneNode(true));
    }
  }
  const remaining = currentSlide.innerHTML.trim();
  if (remaining) {
    if (slides.length === 0) {
      // No h2 found — prepend title
      slides.push({ type: 'content', html: `<h1>${title}</h1>${remaining}` });
    } else {
      slides.push({ type: 'content', html: remaining });
    }
  }

  if (slides.length === 0) {
    slides.push({ type: 'content', html: `<h1>${title}</h1>${html}` });
  }

  return slides;
}

/** Extract quiz data from all quiz-block divs in an HTML string.
 *  Returns alternating content/quiz segments for inline rendering. */
export function splitArticleSegments(html: string): Slide[] {
  const container = document.createElement('div');
  container.innerHTML = html;
  const segments: Slide[] = [];
  let current = document.createElement('div');

  for (const child of Array.from(container.childNodes)) {
    const el = child as HTMLElement;
    if (
      el.nodeType === Node.ELEMENT_NODE &&
      el.classList?.contains('quiz-block')
    ) {
      const content = current.innerHTML.trim();
      if (content) segments.push({ type: 'content', html: content });
      const quiz = extractQuizData(el);
      if (quiz) segments.push({ type: 'quiz', quiz });
      current = document.createElement('div');
    } else {
      current.appendChild(el.cloneNode(true));
    }
  }
  const remaining = current.innerHTML.trim();
  if (remaining) segments.push({ type: 'content', html: remaining });
  return segments;
}

function PresentationMode({
  article,
  darkMode: initialDarkMode,
  onClose,
  nextArticle,
  prevArticle,
  courseSlug,
}: {
  article: LearnArticle;
  darkMode: boolean;
  onClose: () => void;
  nextArticle?: LearnArticle;
  prevArticle?: LearnArticle;
  courseSlug: string;
}) {
  const slides = useMemo(() => splitIntoSlides(article.html, article.title), [article.html, article.title]);
  const total = slides.length;

  // Read initial slide from URL (?slide=N, 1-based for humans)
  const [slideIndex, setSlideIndex] = useState(() => {
    const m = window.location.hash.match(/[?&]slide=(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10) - 1;
      return Math.max(0, Math.min(n, total - 1));
    }
    return 0;
  });
  const currentSlide = slides[slideIndex];
  const [presenterDark, setPresenterDark] = useState(initialDarkMode);
  const slideRef = useRef<HTMLDivElement>(null);

  // Sync slide index to URL (1-based for readability)
  useEffect(() => {
    const base = window.location.hash.replace(/[?&]slide=\d+/, '');
    const sep = base.includes('?') ? '&' : '?';
    history.replaceState(null, '', `${base}${sep}slide=${slideIndex + 1}`);
  }, [slideIndex]);

  const goNext = useCallback(() => {
    if (slideIndex < total - 1) {
      setSlideIndex(slideIndex + 1);
    } else if (nextArticle) {
      window.location.hash = `#/learn/${courseSlug}/${nextArticle.slug}?slide=1`;
    }
  }, [slideIndex, total, nextArticle, courseSlug]);
  const goPrev = useCallback(() => {
    if (slideIndex > 0) {
      setSlideIndex(slideIndex - 1);
    } else if (prevArticle) {
      const prevSlideCount = splitIntoSlides(prevArticle.html, prevArticle.title).length;
      window.location.hash = `#/learn/${courseSlug}/${prevArticle.slug}?slide=${prevSlideCount}`;
    }
  }, [slideIndex, prevArticle, courseSlug]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      else if (e.key === 'Home') { e.preventDefault(); setSlideIndex(0); }
      else if (e.key === 'End') { e.preventDefault(); setSlideIndex(total - 1); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, goNext, goPrev, total]);

  // Hydrate ontology embeds when slide changes
  useEffect(() => {
    if (!slideRef.current) return;

    const placeholders = slideRef.current.querySelectorAll('ontology-embed');
    for (const el of placeholders) {
      const id = el.getAttribute('id');
      const height = el.getAttribute('height') || '350px';
      const diff = el.getAttribute('diff') || '';
      if (!id) continue;
      const wrapper = document.createElement('div');
      wrapper.className = 'learn-embed-slot';
      wrapper.style.height = height;
      wrapper.dataset.catalogueId = id;
      wrapper.dataset.theme = presenterDark ? 'dark' : 'light';
      if (diff) wrapper.dataset.diffId = diff;
      el.replaceWith(wrapper);
    }
    // Hydrate
    const slots = slideRef.current.querySelectorAll<HTMLElement>('.learn-embed-slot');
    if (slots.length === 0) return;
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}catalogue.json`)
      .then((res) => res.json() as Promise<Catalogue>)
      .then((catalogue) => {
        if (cancelled) return;
        for (const slot of slots) {
          const id = slot.dataset.catalogueId;
          const diffId = slot.dataset.diffId;
          const entry = catalogue.entries.find((e) => e.id === id);
          if (!entry) continue;
          const prevEntry = diffId ? catalogue.entries.find((e) => e.id === diffId) : undefined;
          let newEntityIds: Set<string> | undefined;
          let newRelIds: Set<string> | undefined;
          if (prevEntry) {
            const prevEntIds = new Set(prevEntry.ontology.entityTypes.map((et) => et.id));
            const prevRelIdSet = new Set(prevEntry.ontology.relationships.map((r) => r.id));
            newEntityIds = new Set(entry.ontology.entityTypes.filter((et) => !prevEntIds.has(et.id)).map((et) => et.id));
            newRelIds = new Set(entry.ontology.relationships.filter((r) => !prevRelIdSet.has(r.id)).map((r) => r.id));
          }
          renderEmbedSlot(slot, entry, presenterDark, newEntityIds, newRelIds, prevEntry);
        }
      });
    return () => { cancelled = true; };
  }, [slideIndex, presenterDark]);

  return (
    <div className={`presentation-overlay ${presenterDark ? '' : 'light-theme'}`}>
      <div className="presentation-chrome">
        <button className="presentation-close" onClick={onClose} title="Exit (Esc)">
          <X size={20} />
        </button>
        <button
          className="presentation-theme-toggle"
          onClick={() => setPresenterDark((d) => !d)}
          title="Toggle theme"
        >
          {presenterDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <div className="presentation-stage">
        <button
          className="presentation-nav presentation-nav--prev"
          onClick={goPrev}
          disabled={slideIndex === 0 && !prevArticle}
          aria-label={slideIndex === 0 && prevArticle ? `Previous: ${prevArticle.title}` : 'Previous slide'}
        >
          <ArrowLeft size={28} />
        </button>

        <div className="presentation-slide-wrapper">
          {currentSlide.type === 'quiz' ? (
            <div className="presentation-slide learn-article-content" key={slideIndex}>
              <QuizSlide quiz={currentSlide.quiz} key={`quiz-${slideIndex}`} />
            </div>
          ) : (
            <div
              ref={slideRef}
              className="presentation-slide learn-article-content"
              key={slideIndex}
              dangerouslySetInnerHTML={{ __html: currentSlide.html }}
            />
          )}
        </div>

        <button
          className="presentation-nav presentation-nav--next"
          onClick={goNext}
          disabled={slideIndex === total - 1 && !nextArticle}
          aria-label={slideIndex === total - 1 && nextArticle ? `Next: ${nextArticle.title}` : 'Next slide'}
        >
          <ChevronRight size={28} />
        </button>
      </div>

      <div className="presentation-footer">
        <div className="presentation-progress">
          <div
            className="presentation-progress-bar"
            style={{ width: `${((slideIndex + 1) / total) * 100}%` }}
          />
        </div>
        <span className="presentation-counter">
          {slideIndex + 1} / {total}
          {slideIndex === total - 1 && nextArticle && (
            <span className="presentation-next-hint"> — next: {nextArticle.title}</span>
          )}
          {slideIndex === 0 && prevArticle && (
            <span className="presentation-next-hint"> — prev: {prevArticle.title}</span>
          )}
        </span>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Inline embed renderer (lightweight — uses cytoscape directly)
// -------------------------------------------------------------------

interface EmbedOntology {
  entityTypes: Array<{ id: string; name: string; icon: string; color: string }>;
  relationships: Array<{ id: string; name: string; from: string; to: string }>;
}

type EmbedEntry = { name: string; ontology: EmbedOntology };

/** Shared chessboard background CSS (mirrors .graph-container in app.css) — fully opaque */
function applyChessboardBg(el: HTMLElement, darkMode: boolean) {
  const dark = darkMode ? '#0F1625' : '#DAE2F0';
  const light = darkMode ? '#1A2840' : '#EEF2FB';
  el.style.backgroundImage = [
    `linear-gradient(45deg, ${dark} 25%, transparent 25%)`,
    `linear-gradient(-45deg, ${dark} 25%, transparent 25%)`,
    `linear-gradient(45deg, transparent 75%, ${dark} 75%)`,
    `linear-gradient(-45deg, transparent 75%, ${dark} 75%)`,
  ].join(',');
  el.style.backgroundSize = '40px 40px';
  el.style.backgroundPosition = '0 0, 0 20px, 20px -20px, -20px 0px';
  el.style.backgroundColor = light;
}

/** Build the shared Cytoscape style array */
function cyStyles(colors: { nodeText: string; edgeColor: string; edgeText: string }, newHighlight: string) {
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'text-valign': 'bottom' as const,
        'text-halign': 'center' as const,
        'font-size': '11px',
        'font-family': 'Segoe UI, sans-serif',
        'font-weight': 600,
        color: colors.nodeText,
        'text-margin-y': 6,
        width: 48,
        height: 48,
        'background-color': 'data(color)',
        'border-width': 2,
        'border-color': 'data(color)',
        'border-opacity': 0.5,
      },
    },
    {
      selector: 'node.new',
      style: {
        'border-width': 4,
        'border-color': newHighlight,
        'border-opacity': 1,
      },
    },
    {
      selector: 'edge',
      style: {
        label: 'data(label)',
        'font-size': '9px',
        'font-family': 'Segoe UI, sans-serif',
        color: colors.edgeText,
        'text-rotation': 'autorotate' as const,
        'text-margin-y': -12,
        'text-background-color': colors.nodeText === '#B3B3B3' ? '#1E1E1E' : '#FCFCFC',
        'text-background-opacity': 0.7,
        'text-background-padding': '2px',
        width: 1.5,
        'line-color': colors.edgeColor,
        'target-arrow-color': colors.edgeColor,
        'target-arrow-shape': 'triangle' as const,
        'curve-style': 'bezier' as const,
      },
    },
    {
      selector: 'edge.new',
      style: {
        width: 3,
        'line-color': newHighlight,
        'target-arrow-color': newHighlight,
        'line-style': 'solid' as const,
      },
    },
  ];
}

let fcoseRegistered = false;

/** Mount a Cytoscape instance into a container div.
 *  If `fixedPositions` covers every node, uses instant `preset` layout.
 *  Otherwise uses fcose. Returns a promise with the cy instance. */
function mountGraph(
  container: HTMLElement,
  entry: EmbedEntry,
  darkMode: boolean,
  newEntityIds?: Set<string>,
  newRelIds?: Set<string>,
  fixedPositions?: Map<string, { x: number; y: number }>,
): Promise<CytoscapeCore> {
  const newHighlight = '#00C853';
  const nodeIds = entry.ontology.entityTypes.map((e) => e.id);
  const allFixed = fixedPositions != null && nodeIds.every((id) => fixedPositions.has(id));

  const nodes = entry.ontology.entityTypes.map((e) => {
    const pos = fixedPositions?.get(e.id);
    return {
      data: { id: e.id, label: `${e.icon} ${e.name}`, color: e.color },
      classes: newEntityIds?.has(e.id) ? 'new' : '',
      ...(pos ? { position: { x: pos.x, y: pos.y } } : {}),
    };
  });
  const edges = entry.ontology.relationships.map((r) => ({
    data: { id: r.id, source: r.from, target: r.to, label: r.name },
    classes: newRelIds?.has(r.id) ? 'new' : '',
  }));

  const colors = darkMode
    ? { nodeText: '#B3B3B3', edgeColor: '#505050', edgeText: '#808080' }
    : { nodeText: '#2A2A2A', edgeColor: '#888888', edgeText: '#555555' };

  // When every node has a known position, use preset layout (instant, no solver)
  if (allFixed) {
    return import('cytoscape').then(({ default: cytoscape }) => {
      const cy = cytoscape({
        container,
        elements: [...nodes, ...edges],
        style: cyStyles(colors, newHighlight) as unknown as StylesheetCSS[],
        layout: { name: 'preset', fit: true, padding: 30 },
        minZoom: 0.3,
        maxZoom: 3,
        userPanningEnabled: true,
        userZoomingEnabled: true,
        boxSelectionEnabled: false,
      });
      return cy;
    });
  }

  return import('cytoscape').then(({ default: cytoscape }) =>
    import('cytoscape-fcose').then(({ default: fcose }) => {
      if (!fcoseRegistered) {
        cytoscape.use(fcose);
        fcoseRegistered = true;
      }

      const cy = cytoscape({
        container,
        elements: [...nodes, ...edges],
        style: cyStyles(colors, newHighlight) as unknown as StylesheetCSS[],
        layout: {
          name: 'fcose',
          animate: false,
          fit: true,
          padding: 30,
          nodeDimensionsIncludeLabels: true,
        } as LayoutOptions,
        minZoom: 0.3,
        maxZoom: 3,
        userPanningEnabled: true,
        userZoomingEnabled: true,
        boxSelectionEnabled: false,
      });
      return cy;
    }),
  );
}

function renderEmbedSlot(
  slot: HTMLElement,
  entry: EmbedEntry,
  darkMode: boolean,
  newEntityIds?: Set<string>,
  newRelIds?: Set<string>,
  prevEntry?: EmbedEntry,
) {
  const hasNew = (newEntityIds && newEntityIds.size > 0) || (newRelIds && newRelIds.size > 0);
  const hasDiff = !!prevEntry;
  const newHighlight = '#00C853';

  const borderColor = darkMode ? '#404040' : '#C0C0C0';
  slot.style.borderRadius = '8px';
  slot.style.border = `1px solid ${borderColor}`;
  slot.style.overflow = 'hidden';
  slot.innerHTML = '';
  slot.style.display = 'flex';
  slot.style.flexDirection = 'column';
  slot.style.position = 'relative';

  // ── Title bar ──────────────────────────────────────────────────
  const titleBar = document.createElement('div');
  titleBar.style.cssText = `display:flex;align-items:center;gap:8px;padding:8px 12px;font:600 13px/1 'Segoe UI',sans-serif;color:${darkMode ? '#B3B3B3' : '#444'};border-bottom:1px solid ${borderColor};background:${darkMode ? '#252526' : '#F3F3F3'};flex-shrink:0`;

  const titleText = document.createElement('span');
  titleText.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  titleText.textContent = entry.name;
  titleBar.appendChild(titleText);

  // Legend dot
  if (hasNew) {
    const legend = document.createElement('span');
    legend.style.cssText = `display:inline-flex;align-items:center;gap:5px;font:500 11px/1 'Segoe UI',sans-serif;color:${newHighlight};white-space:nowrap`;
    const dot = document.createElement('span');
    dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${newHighlight};display:inline-block;flex-shrink:0`;
    legend.appendChild(dot);
    const count = (newEntityIds?.size ?? 0) + (newRelIds?.size ?? 0);
    legend.appendChild(document.createTextNode(`${count} new`));
    titleBar.appendChild(legend);
  }

  // Before / After toggle (only when there's a previous step)
  let activeView: 'after' | 'before' = 'after';
  let beforeBtn: HTMLButtonElement | undefined;
  let afterBtn: HTMLButtonElement | undefined;

  // Pre-built graph containers (created once, toggled via display)
  const afterDiv = document.createElement('div');
  afterDiv.style.cssText = 'width:100%;height:100%;position:absolute;inset:0';
  applyChessboardBg(afterDiv, darkMode);

  let beforeDiv: HTMLDivElement | undefined;
  let afterCy: CytoscapeCore | undefined;
  let beforeCy: CytoscapeCore | undefined;

  if (hasDiff) {
    beforeDiv = document.createElement('div');
    beforeDiv.style.cssText = 'width:100%;height:100%;position:absolute;inset:0;display:none';
    applyChessboardBg(beforeDiv, darkMode);

    const toggleGroup = document.createElement('span');
    toggleGroup.style.cssText = 'display:inline-flex;border-radius:4px;overflow:hidden;border:1px solid ' + borderColor + ';flex-shrink:0';

    const makeTgl = (label: string, value: 'before' | 'after') => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `border:none;padding:3px 10px;font:500 11px/1 'Segoe UI',sans-serif;cursor:pointer;transition:background .15s,color .15s`;
      btn.addEventListener('click', () => {
        if (activeView === value) return;
        activeView = value;
        updateToggleStyles();
        showActiveView();
      });
      return btn;
    };

    beforeBtn = makeTgl('Before', 'before');
    afterBtn = makeTgl('After', 'after');
    toggleGroup.appendChild(beforeBtn);
    toggleGroup.appendChild(afterBtn);
    titleBar.appendChild(toggleGroup);
  }

  // Maximize / fullscreen button
  const maximizeBtn = document.createElement('button');
  maximizeBtn.title = 'Toggle fullscreen';
  maximizeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
  maximizeBtn.style.cssText = `border:none;background:none;cursor:pointer;color:${darkMode ? '#B3B3B3' : '#666'};padding:2px;display:flex;align-items:center;flex-shrink:0`;
  let isFullscreen = false;
  let savedHeight = '';
  maximizeBtn.addEventListener('click', () => {
    isFullscreen = !isFullscreen;
    if (isFullscreen) {
      savedHeight = slot.style.height;
      slot.style.cssText = '';
      slot.classList.add('learn-embed-fullscreen');
    } else {
      slot.classList.remove('learn-embed-fullscreen');
      slot.style.height = savedHeight;
    }
    // Extra right padding when fullscreen inside presentation to avoid
    // overlapping the presentation chrome (close / theme toggle buttons)
    const inPresentation = !!slot.closest('.presentation-overlay');
    titleBar.style.paddingRight = isFullscreen && inPresentation ? '100px' : '12px';
    slot.style.borderRadius = isFullscreen ? '0' : '8px';
    slot.style.border = isFullscreen ? 'none' : `1px solid ${borderColor}`;
    slot.style.overflow = 'hidden';
    slot.style.display = 'flex';
    slot.style.flexDirection = 'column';
    slot.style.position = isFullscreen ? 'fixed' : 'relative';
    if (isFullscreen) {
      maximizeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6m0 0v6m0-6L3 21M20 10h-6m0 0V4m0 6l7-7"/></svg>';
    } else {
      maximizeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
    }
    // Resize both graphs to fit new container size
    requestAnimationFrame(() => {
      if (afterCy) { afterCy.resize(); afterCy.fit(undefined, 30); }
      if (beforeCy) { beforeCy.resize(); beforeCy.fit(undefined, 30); }
    });
  });
  titleBar.appendChild(maximizeBtn);
  slot.appendChild(titleBar);

  // ── Graph area (both views stacked absolutely) ─────────────────
  const graphContainer = document.createElement('div');
  graphContainer.style.cssText = 'flex:1;width:100%;min-height:0;position:relative';
  graphContainer.appendChild(afterDiv);
  if (beforeDiv) graphContainer.appendChild(beforeDiv);
  slot.appendChild(graphContainer);

  function updateToggleStyles() {
    if (!beforeBtn || !afterBtn) return;
    const activeBg = '#0078D4';
    const inactiveBg = darkMode ? '#2D2D2D' : '#FFFFFF';
    const activeCol = '#FFFFFF';
    const inactiveCol = darkMode ? '#888' : '#666';
    beforeBtn.style.background = activeView === 'before' ? activeBg : inactiveBg;
    beforeBtn.style.color = activeView === 'before' ? activeCol : inactiveCol;
    afterBtn.style.background = activeView === 'after' ? activeBg : inactiveBg;
    afterBtn.style.color = activeView === 'after' ? activeCol : inactiveCol;
  }

  // Lazily create the before graph on first toggle (avoids layout in a hidden div)
  let beforeMounting = false;
  function ensureBeforeGraph() {
    if (beforeCy || beforeMounting || !prevEntry || !beforeDiv || !afterCy) return;
    beforeMounting = true;
    // Extract node positions from the after graph
    const afterPositions = new Map<string, { x: number; y: number }>();
    afterCy.nodes().forEach((n: { id: () => string; position: () => { x: number; y: number } }) => {
      afterPositions.set(n.id(), n.position());
    });
    // beforeDiv is now visible (display != none), so preset layout works
    mountGraph(beforeDiv, prevEntry, darkMode, undefined, undefined, afterPositions).then((bcy) => {
      beforeCy = bcy;
      beforeMounting = false;
    });
  }

  function showActiveView() {
    afterDiv.style.display = activeView === 'after' ? '' : 'none';
    if (beforeDiv) beforeDiv.style.display = activeView === 'before' ? '' : 'none';
    // Lazily mount the before graph the first time it becomes visible
    if (activeView === 'before') ensureBeforeGraph();
    // Resize the now-visible graph so it fills correctly
    requestAnimationFrame(() => {
      if (activeView === 'after' && afterCy) { afterCy.resize(); afterCy.fit(undefined, 30); }
      if (activeView === 'before' && beforeCy) { beforeCy.resize(); beforeCy.fit(undefined, 30); }
    });
  }

  updateToggleStyles();

  // Mount only the "after" graph eagerly; "before" is created lazily on first toggle
  mountGraph(afterDiv, entry, darkMode, newEntityIds, newRelIds).then((cy) => {
    afterCy = cy;
  });
}
