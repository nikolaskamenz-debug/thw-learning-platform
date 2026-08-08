'use client';

import { useMemo, useState } from 'react';

const defaultQuestions = [
  {
    id: 1,
    question: 'Wofür steht die Abkürzung THW?',
    options: [
      'Technisches Hilfswerk',
      'Technische Hilfe West',
      'Team Hilfe Werk',
      'Technischer Hochwasserschutz',
    ],
    answer: 0,
  },
  {
    id: 2,
    question: 'Was ist bei einer Ausbildungseinheit besonders wichtig?',
    options: [
      'Sicherheitsregeln beachten',
      'Möglichst schnell arbeiten',
      'Dokumentation vermeiden',
      'Nur allein üben',
    ],
    answer: 0,
  },
];

export default function QuizComponent({ questions = defaultQuestions, onComplete }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const currentQuestion = questions[currentIndex];
  const progress = useMemo(
    () => (questions.length ? Math.round(((currentIndex + (finished ? 1 : 0)) / questions.length) * 100) : 0),
    [currentIndex, finished, questions.length],
  );

  function submitAnswer() {
    if (selectedAnswer === null || !currentQuestion) return;

    const isCorrect = selectedAnswer === currentQuestion.answer;
    const nextScore = score + (isCorrect ? 1 : 0);

    if (currentIndex === questions.length - 1) {
      setScore(nextScore);
      setFinished(true);
      onComplete?.({ score: nextScore, total: questions.length });
      return;
    }

    setScore(nextScore);
    setCurrentIndex((index) => index + 1);
    setSelectedAnswer(null);
  }

  function restart() {
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setScore(0);
    setFinished(false);
  }

  if (!questions.length) {
    return <section><h2>Quiz</h2><p>Keine Fragen verfügbar.</p></section>;
  }

  if (finished) {
    return (
      <section>
        <h2>Quiz abgeschlossen</h2>
        <p>Ergebnis: {score} von {questions.length} richtig.</p>
        <button type="button" onClick={restart}>Quiz wiederholen</button>
      </section>
    );
  }

  return (
    <section>
      <h2>Quiz</h2>
      <p>Frage {currentIndex + 1} von {questions.length} · {progress}%</p>
      <h3>{currentQuestion.question}</h3>
      <div>
        {currentQuestion.options.map((option, index) => (
          <label key={option} style={{ display: 'block', marginBottom: 8 }}>
            <input
              type="radio"
              name={`question-${currentQuestion.id}`}
              checked={selectedAnswer === index}
              onChange={() => setSelectedAnswer(index)}
            />{' '}
            {option}
          </label>
        ))}
      </div>
      <button type="button" onClick={submitAnswer} disabled={selectedAnswer === null}>
        {currentIndex === questions.length - 1 ? 'Quiz abschließen' : 'Nächste Frage'}
      </button>
    </section>
  );
}
