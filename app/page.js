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
import Benutzerfreigabe from './components/Benutzerfreigabe';

export default function Home() {
  const [quizResult, setQuizResult] = useState(null);
  const [lastUpload, setLastUpload] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const profil = currentUser?.profile;
  const role = profil?.role;

  /* Ein Konto ohne Freischaltung hat keine Rolle — auch wenn in der
     Spalte etwas steht. Das ist keine Anzeigefrage: Die Datenbank
     verweigert diesen Konten ohnehin jeden Zugriff. Die Oberfläche sagt
     nur, warum. */
  const freigeschaltet = profil?.freigeschaltet === true;
  const isStudent = freigeschaltet && role === 'Schüler';
  const isTrainer = freigeschaltet && (role === 'Ausbilder' || role === 'Admin');
  const isAdmin = freigeschaltet && role === 'Admin';

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
          {!currentUser
            ? 'In Entwicklung'
            : freigeschaltet
              ? `Angemeldet · ${role}`
              : 'Wartet auf Freischaltung'}
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

      {/* ---------- Wartet auf Freischaltung ---------- */}
      {currentUser && !freigeschaltet && (
        <section className="abschnitt">
          <div className="karte karte--gelb" style={{ maxWidth: 560 }}>
            <span className="ol">Zugang</span>
            <h2>Dein Konto wartet</h2>
            <p style={{ margin: '12px 0', fontSize: 15.5 }}>
              Die Anmeldung hat geklappt — freigeschaltet bist du aber noch
              nicht. Die Plattform läuft im geschlossenen Testbetrieb, deshalb
              gibt ein Mensch jedes Konto einzeln frei.
            </p>
            <p style={{ margin: '0 0 12px', fontSize: 15.5 }}>
              Das dauert in der Regel ein bis zwei Tage. Du bekommst keine
              Benachrichtigung — schau einfach wieder vorbei und melde dich an.
            </p>
            <p style={{ fontSize: 14, color: 'var(--weiss-50)' }}>
              Dauert es länger oder passt etwas nicht? Schreib an{' '}
              <a href="mailto:info@thw-ai.de">info@thw-ai.de</a>.
            </p>
          </div>
        </section>
      )}

      {/* ---------- Freigeschaltet ---------- */}
      {currentUser && freigeschaltet && (
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

          {isAdmin && (
            <>
              <Benutzerfreigabe user={currentUser} />
              <MaterialReview user={currentUser} />
            </>
          )}

          {/*
            Chat und Quiz stehen allen Freigeschalteten offen, nicht nur
            Schülern. Wer Fragen schreibt, muss sie selbst durchspielen
            können — und der KI-Ausbilder ist für Ausbilder mindestens so
            nützlich wie für die Truppe.
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
      )}
    </main>
  );
}
