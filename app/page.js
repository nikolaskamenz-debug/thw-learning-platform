'use client';

import { useState } from 'react';
import AuthPanel from './components/AuthPanel';
import StudentDashboard from './components/StudentDashboard';
import TrainerDashboard from './components/TrainerDashboard';
import MaterialReview from './components/MaterialReview';
import ChatInterface from './components/ChatInterface';
import QuizComponent from './components/QuizComponent';
import QuizEditor from './components/QuizEditor';
import UploadComponent from './components/UploadComponent';
import ProgressTracker from './components/ProgressTracker';
import OffeneAntworten from './components/OffeneAntworten';

export default function Home() {
  const [quizResult, setQuizResult] = useState(null);
  const [lastUpload, setLastUpload] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const role = currentUser?.profile?.role;
  const isStudent = role === 'Schüler';
  const isTrainer = role === 'Ausbilder' || role === 'Admin';
  const isAdmin = role === 'Admin';

  return (
    <main className="seite">
      <header className="kopfzeile">
        <span className="wortmarke">
          <b>THW</b> Learn AI
        </span>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11.5,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'var(--weiss-50)',
          }}
        >
          {role ? `Angemeldet · ${role}` : 'In Entwicklung'}
        </span>
      </header>

      {!currentUser && (
        <div className="abschnitt" style={{ maxWidth: 620 }}>
          <h1>Lernen mit Beleg</h1>
          <p style={{ marginTop: 12, fontSize: 16.5 }}>
            Ausbildungsinhalte, Quizze und ein KI-Ausbilder, der seine Antworten
            aus freigegebenen Originalunterlagen zieht.
          </p>
        </div>
      )}

      <AuthPanel onUserChange={setCurrentUser} />

      {currentUser ? (
        <>
          {isStudent && <StudentDashboard user={currentUser} />}

          {isTrainer && (
            <>
              <TrainerDashboard user={currentUser} />
              <UploadComponent onUploaded={setLastUpload} />
              {lastUpload && (
                <p className="meldung meldung--ok" role="status">
                  Zuletzt hochgeladen: {lastUpload.document?.title || lastUpload.fileName}
                </p>
              )}
              <QuizEditor user={currentUser} />
              <OffeneAntworten user={currentUser} />
            </>
          )}

          {isAdmin && <MaterialReview user={currentUser} />}

          {/*
            Chat und Quiz stehen allen Angemeldeten offen, nicht nur
            Schuelern. Wer Fragen schreibt, muss sie selbst durchspielen
            koennen — und der KI-Ausbilder ist fuer Ausbilder mindestens
            so nuetzlich wie fuer die Truppe.
          */}
          <ChatInterface />

          <QuizComponent onComplete={setQuizResult} />
          {quizResult && (
            <p className="meldung meldung--ok" role="status">
              Zuletzt: {quizResult.score} von {quizResult.total} Punkten
              {quizResult.offen ? ` · ${quizResult.offen} noch zu beurteilen` : ''}.
            </p>
          )}

          {isStudent && <ProgressTracker userId={currentUser.id} />}
        </>
      ) : null}
    </main>
  );
}
