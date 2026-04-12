import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  QuizSlide,
  extractQuizData,
  splitIntoSlides,
  splitArticleSegments,
  type QuizData,
} from './LearnPage';

// ---------------------------------------------------------------------------
// QuizSlide React component
// ---------------------------------------------------------------------------

const sampleQuiz: QuizData = {
  question: 'What is an ontology?',
  options: [
    { text: 'A database schema', correct: false },
    { text: 'A formal model of a domain', correct: true },
    { text: 'A spreadsheet', correct: false },
  ],
  explanation: 'An ontology formally models a domain with entities and relationships.',
};

describe('QuizSlide', () => {
  it('renders the question and all options', () => {
    render(<QuizSlide quiz={sampleQuiz} />);
    expect(screen.getByText('What is an ontology?')).toBeTruthy();
    expect(screen.getByText('A database schema')).toBeTruthy();
    expect(screen.getByText('A formal model of a domain')).toBeTruthy();
    expect(screen.getByText('A spreadsheet')).toBeTruthy();
  });

  it('shows option letters A, B, C', () => {
    render(<QuizSlide quiz={sampleQuiz} />);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('C')).toBeTruthy();
  });

  it('does not show result or explanation before answering', () => {
    render(<QuizSlide quiz={sampleQuiz} />);
    expect(screen.queryByText('Correct!')).toBeNull();
    expect(screen.queryByText('Not quite')).toBeNull();
    expect(screen.queryByText(sampleQuiz.explanation)).toBeNull();
  });

  it('shows "Correct!" when clicking the right answer', async () => {
    const user = userEvent.setup();
    render(<QuizSlide quiz={sampleQuiz} />);
    await user.click(screen.getByText('A formal model of a domain'));
    expect(screen.getByText('Correct!')).toBeTruthy();
    expect(screen.getByText(sampleQuiz.explanation)).toBeTruthy();
  });

  it('shows "Not quite" when clicking a wrong answer', async () => {
    const user = userEvent.setup();
    render(<QuizSlide quiz={sampleQuiz} />);
    await user.click(screen.getByText('A database schema'));
    expect(screen.getByText('Not quite')).toBeTruthy();
    expect(screen.getByText(sampleQuiz.explanation)).toBeTruthy();
  });

  it('disables all buttons after answering', async () => {
    const user = userEvent.setup();
    render(<QuizSlide quiz={sampleQuiz} />);
    await user.click(screen.getByText('A database schema'));
    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn).toBeInstanceOf(HTMLButtonElement);
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('marks correct option green and wrong option red', async () => {
    const user = userEvent.setup();
    render(<QuizSlide quiz={sampleQuiz} />);
    await user.click(screen.getByText('A database schema'));
    // The wrong button clicked should have --wrong class
    const wrongBtn = screen.getByText('A database schema').closest('button')!;
    expect(wrongBtn.className).toContain('quiz-option--wrong');
    // The correct one should have --correct class
    const correctBtn = screen.getByText('A formal model of a domain').closest('button')!;
    expect(correctBtn.className).toContain('quiz-option--correct');
    // The other should be dimmed
    const dimmedBtn = screen.getByText('A spreadsheet').closest('button')!;
    expect(dimmedBtn.className).toContain('quiz-option--dimmed');
  });

  it('does not show explanation when explanation is empty', async () => {
    const user = userEvent.setup();
    const noExplanation: QuizData = { ...sampleQuiz, explanation: '' };
    render(<QuizSlide quiz={noExplanation} />);
    await user.click(screen.getByText('A formal model of a domain'));
    expect(screen.getByText('Correct!')).toBeTruthy();
    expect(screen.queryByText(sampleQuiz.explanation)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractQuizData
// ---------------------------------------------------------------------------

describe('extractQuizData', () => {
  it('parses data-quiz attribute with HTML entities', () => {
    // Use innerHTML to simulate what the browser does when parsing compiled HTML
    // (setAttribute doesn't decode HTML entities)
    const wrapper = document.createElement('div');
    const json = JSON.stringify(sampleQuiz).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    wrapper.innerHTML = `<div data-quiz="${json}"></div>`;
    const div = wrapper.firstElementChild as HTMLElement;
    const result = extractQuizData(div);
    expect(result).toEqual(sampleQuiz);
  });

  it('returns null when data-quiz is missing', () => {
    const div = document.createElement('div');
    expect(extractQuizData(div)).toBeNull();
  });

  it('returns null on invalid JSON', () => {
    const div = document.createElement('div');
    div.setAttribute('data-quiz', 'not json');
    expect(extractQuizData(div)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// splitIntoSlides
// ---------------------------------------------------------------------------

describe('splitIntoSlides', () => {
  it('creates a title slide from content before first h2', () => {
    const html = '<p>Intro text</p><h2>Section One</h2><p>body</p>';
    const slides = splitIntoSlides(html, 'My Title');
    expect(slides.length).toBeGreaterThanOrEqual(2);
    expect(slides[0].type).toBe('content');
    if (slides[0].type === 'content') {
      expect(slides[0].html).toContain('<h1>My Title</h1>');
      expect(slides[0].html).toContain('Intro text');
    }
  });

  it('splits on h2 boundaries', () => {
    const html = '<h2>First</h2><p>A</p><h2>Second</h2><p>B</p>';
    const slides = splitIntoSlides(html, 'Title');
    // Title slide + 2 h2 slides
    const contentSlides = slides.filter((s) => s.type === 'content');
    expect(contentSlides.length).toBe(3);
  });

  it('splits on <hr> within a section', () => {
    const html = '<h2>Sec</h2><p>A</p><hr><p>B</p>';
    const slides = splitIntoSlides(html, 'Title');
    // Title + h2 content + post-hr content
    expect(slides.filter((s) => s.type === 'content').length).toBe(3);
  });

  it('creates quiz slides for quiz-block divs', () => {
    const quiz: QuizData = {
      question: 'Q?',
      options: [
        { text: 'A', correct: true },
        { text: 'B', correct: false },
      ],
      explanation: 'Because A.',
    };
    const json = JSON.stringify(quiz).replace(/"/g, '&quot;');
    const html = `<h2>Sec</h2><p>content</p><div class="quiz-block" data-quiz="${json}"></div><p>more</p>`;
    const slides = splitIntoSlides(html, 'Title');
    const quizSlides = slides.filter((s) => s.type === 'quiz');
    expect(quizSlides.length).toBe(1);
    if (quizSlides[0].type === 'quiz') {
      expect(quizSlides[0].quiz.question).toBe('Q?');
    }
  });

  it('handles no h2 elements — wraps all as single slide', () => {
    const html = '<p>Just text</p>';
    const slides = splitIntoSlides(html, 'Title');
    expect(slides.length).toBe(1);
    expect(slides[0].type).toBe('content');
    if (slides[0].type === 'content') {
      expect(slides[0].html).toContain('<h1>Title</h1>');
    }
  });

  it('handles empty html', () => {
    const slides = splitIntoSlides('', 'Empty');
    expect(slides.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// splitArticleSegments
// ---------------------------------------------------------------------------

describe('splitArticleSegments', () => {
  it('returns single content segment when no quizzes', () => {
    const html = '<p>Hello</p><h2>Section</h2><p>Content</p>';
    const segments = splitArticleSegments(html);
    expect(segments.length).toBe(1);
    expect(segments[0].type).toBe('content');
  });

  it('splits content around quiz blocks', () => {
    const quiz: QuizData = {
      question: 'Test?',
      options: [
        { text: 'Yes', correct: true },
        { text: 'No', correct: false },
      ],
      explanation: 'Yes!',
    };
    const json = JSON.stringify(quiz).replace(/"/g, '&quot;');
    const html = `<p>Before</p><div class="quiz-block" data-quiz="${json}"></div><p>After</p>`;
    const segments = splitArticleSegments(html);
    expect(segments.length).toBe(3);
    expect(segments[0].type).toBe('content');
    expect(segments[1].type).toBe('quiz');
    expect(segments[2].type).toBe('content');
    if (segments[0].type === 'content') {
      expect(segments[0].html).toContain('Before');
    }
    if (segments[1].type === 'quiz') {
      expect(segments[1].quiz.question).toBe('Test?');
    }
    if (segments[2].type === 'content') {
      expect(segments[2].html).toContain('After');
    }
  });

  it('handles multiple quiz blocks', () => {
    const q1: QuizData = {
      question: 'Q1?',
      options: [{ text: 'A', correct: true }],
      explanation: '',
    };
    const q2: QuizData = {
      question: 'Q2?',
      options: [{ text: 'B', correct: true }],
      explanation: '',
    };
    const j1 = JSON.stringify(q1).replace(/"/g, '&quot;');
    const j2 = JSON.stringify(q2).replace(/"/g, '&quot;');
    const html = `<p>A</p><div class="quiz-block" data-quiz="${j1}"></div><p>B</p><div class="quiz-block" data-quiz="${j2}"></div><p>C</p>`;
    const segments = splitArticleSegments(html);
    expect(segments.filter((s) => s.type === 'quiz').length).toBe(2);
    expect(segments.filter((s) => s.type === 'content').length).toBe(3);
  });

  it('handles quiz at the very end', () => {
    const quiz: QuizData = {
      question: 'End quiz?',
      options: [{ text: 'Y', correct: true }],
      explanation: '',
    };
    const json = JSON.stringify(quiz).replace(/"/g, '&quot;');
    const html = `<p>Content</p><div class="quiz-block" data-quiz="${json}"></div>`;
    const segments = splitArticleSegments(html);
    expect(segments.length).toBe(2);
    expect(segments[0].type).toBe('content');
    expect(segments[1].type).toBe('quiz');
  });
});
