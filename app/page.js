'use client';

import { useState } from 'react';
import AuthPanel from './components/AuthPanel';
import ChatInterface from './components/ChatInterface';
import QuizComponent from './components/QuizComponent';
import UploadComponent from './components/UploadComponent';
import ProgressTracker from './components/ProgressTracker';

export default function Home() {
  const [quizResult, setQuizResult] = useState(null);
  const [lastUpload, setLastUpload] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <header style={{ marginBottom: 32 }}>
        <h1>THW Learn AI</h1>
        <p>Lernplattform für Ausbildung, Dokumente, Quiz und KI-gestütztes Lernen.</p>
      </header>

      <div style={{ display: 'grid', gap: 24 }}>
        <AuthPanel onUserChange={setCurrentUser} />

        {currentUser ? (
          <>
            <ChatInterface />

            <QuizComponent onComplete={setQuizResult} />
            {quizResult && (
              <p role="status">
                Letztes Quiz-Ergebnis: {quizResult.score} von {quizResult.total} richtig.
              </p>
            )}

            <UploadComponent onUploaded={setLastUpload} />
            {lastUpload && (
              <p role="status">Zuletzt hochgeladen: {lastUpload.fileName}</p>
            )}

            <ProgressTracker userId={currentUser.id} />
          </>
        ) : (
          <p>Bitte anmelden oder registrieren, um die Lernplattform zu verwenden.</p>
        )}
      </div>
    </main>
  );
}
