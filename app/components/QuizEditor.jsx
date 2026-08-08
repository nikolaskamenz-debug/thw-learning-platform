'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabaseClient';

/**
 * Quizze und Fragen anlegen — fuer Ausbilder und Admins.
 *
 * Bis hierher ging das nur ueber SQL. Damit konnte niemand mitarbeiten,
 * der nicht an der Datenbank sitzt — und genau die Leute, die die Fragen
 * stellen sollten, sind Ausbilder und keine Entwickler.
 *
 * Die Loesung wird getrennt in quiz_loesungen geschrieben. Das ist keine
 * Umstaendlichkeit: Row-Level-Security schuetzt Zeilen, keine Spalten.
 * Stuende die Loesung neben der Frage, koennte jeder Schueler sie lesen,
 * der die Frage lesen darf.
 */

const TYPEN = [
  { wert: 'single_choice',   text: 'Eine richtige Antwort' },
  { wert: 'multiple_choice', text: 'Mehrere richtige Antworten' },
  { wert: 'wahr_falsch',     text: 'Wahr oder falsch' },
  { wert: 'reihenfolge',     text: 'Reihenfolge' },
  { wert: 'zuordnung',       text: 'Zuordnung' },
  { wert: 'lueckentext',     text: 'Lückentext' },
  { wert: 'freitext',        text: 'Freitext' },
  { wert: 'fallbeispiel',    text: 'Fallbeispiel' },
  { wert: 'bilderkennung',   text: 'Bild erkennen' },
];

const MIT_OPTIONEN = ['single_choice', 'multiple_choice', 'reihenfolge', 'bilderkennung'];
const OHNE_BEWERTUNG = ['freitext', 'fallbeispiel'];

function leereFrage() {
  return {
    typ: 'single_choice',
    frage: '',
    optionen: ['', ''],
    links: ['', ''],
    rechts: ['', ''],
    zuordnungen: {},
    loesungIndex: null,
    loesungIndizes: [],
    loesungWahr: null,
    luecken: [],
    schluesselwoerter: '',
    musterantwort: '',
    erklaerung: '',
    quelleDokumentId: '',
    quelleSeite: '',
    punkte: 1,
  };
}

/** Wie viele {{1}}-Marken stehen im Text? */
function lueckenZaehlen(text) {
  return (String(text).match(/\{\{\s*\d+\s*\}\}/g) || []).length;
}

export default function QuizEditor({ user }) {
  const rolle = user?.profile?.role;
  const darf = rolle === 'Ausbilder' || rolle === 'Admin';

  const [quizze, setQuizze] = useState([]);
  const [quiz, setQuiz] = useState(null);
  const [fragen, setFragen] = useState([]);
  const [unterlagen, setUnterlagen] = useState([]);
  const [entwurf, setEntwurf] = useState(leereFrage);
  const [neuesQuiz, setNeuesQuiz] = useState({ title: '', description: '', chapter: '', difficulty: 'Einfach' });
  const [formOffen, setFormOffen] = useState(false);
  const [meldung, setMeldung] = useState('');
  const [art, setArt] = useState('');
  const [laedt, setLaedt] = useState(true);
  const [sendet, setSendet] = useState(false);

  function melde(text, artDerMeldung = '') {
    setMeldung(text);
    setArt(artDerMeldung);
  }

  // ---------- Laden ----------
  const quizzeLaden = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('quizzes')
      .select('id,title,description,chapter,difficulty,is_published,created_at')
      .order('created_at', { ascending: false });

    if (error) {
      melde(error.message, 'fehler');
      return;
    }
    setQuizze(data || []);
  }, []);

  const fragenLaden = useCallback(async (quizId) => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('quiz_questions')
      .select('id,position,typ,frage,punkte,quelle_seite,thw_documents(title)')
      .eq('quiz_id', quizId)
      .order('position');

    if (error) {
      melde(error.message, 'fehler');
      return;
    }
    setFragen(data || []);
  }, []);

  useEffect(() => {
    if (!darf) {
      setLaedt(false);
      return;
    }

    (async () => {
      const supabase = getSupabaseBrowserClient();
      const [, { data: docs }] = await Promise.all([
        quizzeLaden(),
        supabase
          .from('thw_documents')
          .select('id,title')
          .eq('status', 'approved')
          .order('title'),
      ]);
      setUnterlagen(docs || []);
      setLaedt(false);
    })();
  }, [darf, quizzeLaden]);

  useEffect(() => {
    if (quiz) fragenLaden(quiz.id);
  }, [quiz, fragenLaden]);

  // ---------- Quiz anlegen ----------
  async function quizAnlegen(e) {
    e.preventDefault();
    if (neuesQuiz.title.trim().length < 3) {
      melde('Bitte gib dem Quiz einen Titel mit mindestens drei Zeichen.', 'fehler');
      return;
    }

    setSendet(true);
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('quizzes')
      .insert({
        title: neuesQuiz.title.trim(),
        description: neuesQuiz.description.trim() || null,
        chapter: neuesQuiz.chapter.trim() || null,
        difficulty: neuesQuiz.difficulty,
        is_published: false,
        created_by: user.id,
      })
      .select('id,title,description,chapter,difficulty,is_published,created_at')
      .single();
    setSendet(false);

    if (error) {
      melde(error.message, 'fehler');
      return;
    }

    setNeuesQuiz({ title: '', description: '', chapter: '', difficulty: 'Einfach' });
    await quizzeLaden();
    setQuiz(data);
    melde('Quiz angelegt. Es ist noch nicht veröffentlicht — Schüler sehen es erst danach.', 'ok');
  }

  async function veroeffentlichungUmschalten() {
    const supabase = getSupabaseBrowserClient();
    const neu = !quiz.is_published;

    if (neu && fragen.length === 0) {
      melde('Ein Quiz ohne Fragen zu veröffentlichen bringt niemandem etwas.', 'fehler');
      return;
    }

    const { error } = await supabase.from('quizzes').update({ is_published: neu }).eq('id', quiz.id);
    if (error) {
      melde(error.message, 'fehler');
      return;
    }

    setQuiz({ ...quiz, is_published: neu });
    await quizzeLaden();
    melde(neu ? 'Veröffentlicht. Schüler sehen das Quiz ab sofort.' : 'Zurückgenommen. Schüler sehen es nicht mehr.', 'ok');
  }

  // ---------- Frage bauen ----------
  const lueckenAnzahl = useMemo(() => lueckenZaehlen(entwurf.frage), [entwurf.frage]);

  function pruefeEntwurf() {
    const e = entwurf;

    if (e.frage.trim().length < 3) return 'Bitte formuliere die Frage.';

    if (MIT_OPTIONEN.includes(e.typ)) {
      const gefuellt = e.optionen.filter((o) => o.trim());
      if (gefuellt.length < 2) return 'Bitte gib mindestens zwei Antwortmöglichkeiten an.';
      if (gefuellt.length !== e.optionen.length) return 'Bitte fülle alle Antwortfelder aus oder entferne die leeren.';
    }

    if (['single_choice', 'bilderkennung'].includes(e.typ) && e.loesungIndex === null) {
      return 'Bitte markiere, welche Antwort richtig ist.';
    }

    if (e.typ === 'multiple_choice' && e.loesungIndizes.length === 0) {
      return 'Bitte markiere mindestens eine richtige Antwort.';
    }

    if (e.typ === 'wahr_falsch' && e.loesungWahr === null) {
      return 'Bitte lege fest, ob die Aussage wahr oder falsch ist.';
    }

    if (e.typ === 'zuordnung') {
      const l = e.links.filter((x) => x.trim());
      const r = e.rechts.filter((x) => x.trim());
      if (l.length < 2 || r.length < 2) return 'Bitte gib links und rechts mindestens je zwei Begriffe an.';
      if (Object.keys(e.zuordnungen).length !== l.length) return 'Bitte ordne jedem Begriff links einen rechts zu.';
    }

    if (e.typ === 'lueckentext') {
      if (lueckenAnzahl === 0) return 'Setze mindestens eine Lücke als {{1}} in den Fragetext.';
      if (e.luecken.filter((x) => (x || '').trim()).length !== lueckenAnzahl) {
        return 'Bitte gib für jede Lücke die richtige Lösung an.';
      }
    }

    return null;
  }

  function loesungBauen() {
    const e = entwurf;
    switch (e.typ) {
      case 'single_choice':
      case 'bilderkennung':
        return { index: String(e.loesungIndex) };
      case 'multiple_choice':
        return { indizes: e.loesungIndizes.map(String) };
      case 'wahr_falsch':
        return { wahr: e.loesungWahr };
      case 'reihenfolge':
        // Der Ausbilder traegt die Schritte in der richtigen Folge ein.
        // Angezeigt werden sie spaeter gemischt.
        return { reihenfolge: e.optionen.map((unused, i) => String(i)) };
      case 'zuordnung':
        return {
          paare: Object.entries(e.zuordnungen).map(([links, rechts]) => [String(links), String(rechts)]),
        };
      case 'lueckentext':
        return { luecken: e.luecken.slice(0, lueckenAnzahl).map((x) => (x || '').trim()) };
      case 'freitext':
      case 'fallbeispiel':
        return {
          schluesselwoerter: e.schluesselwoerter
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
          musterantwort: e.musterantwort.trim() || null,
        };
      default:
        return {};
    }
  }

  async function frageSpeichern(ev) {
    ev.preventDefault();

    const problem = pruefeEntwurf();
    if (problem) {
      melde(problem, 'fehler');
      return;
    }

    setSendet(true);
    const supabase = getSupabaseBrowserClient();
    const e = entwurf;

    let optionen = null;
    if (MIT_OPTIONEN.includes(e.typ)) {
      optionen = e.optionen.map((o) => o.trim());
    } else if (e.typ === 'zuordnung') {
      optionen = {
        links: e.links.filter((x) => x.trim()).map((x) => x.trim()),
        rechts: e.rechts.filter((x) => x.trim()).map((x) => x.trim()),
      };
    }

    const { data: frage, error: frageFehler } = await supabase
      .from('quiz_questions')
      .insert({
        quiz_id: quiz.id,
        position: (fragen[fragen.length - 1]?.position || 0) + 1,
        typ: e.typ,
        frage: e.frage.trim(),
        optionen,
        punkte: Number(e.punkte) || 1,
        quelle_dokument_id: e.quelleDokumentId || null,
        quelle_seite: e.quelleSeite ? Number(e.quelleSeite) : null,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (frageFehler) {
      setSendet(false);
      melde(frageFehler.message, 'fehler');
      return;
    }

    const { error: loesungFehler } = await supabase.from('quiz_loesungen').insert({
      frage_id: frage.id,
      loesung: loesungBauen(),
      erklaerung: e.erklaerung.trim() || null,
    });

    setSendet(false);

    if (loesungFehler) {
      // Eine Frage ohne Loesung ist unbrauchbar — sie wuerde beim
      // Beantworten einen Fehler werfen. Also wieder weg damit.
      await supabase.from('quiz_questions').delete().eq('id', frage.id);
      melde(`Die Lösung konnte nicht gespeichert werden, die Frage wurde deshalb verworfen: ${loesungFehler.message}`, 'fehler');
      return;
    }

    setEntwurf(leereFrage());
    setFormOffen(false);
    await fragenLaden(quiz.id);
    melde('Frage gespeichert.', 'ok');
  }

  async function frageLoeschen(id) {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from('quiz_questions').delete().eq('id', id);
    if (error) {
      melde(error.message, 'fehler');
      return;
    }
    await fragenLaden(quiz.id);
    melde('Frage entfernt.', 'ok');
  }

  if (!darf) return null;

  // ---------- Quizauswahl ----------
  if (!quiz) {
    return (
      <section className="abschnitt">
        <div className="karte">
          <span className="ol">Ausbilder</span>
          <h2>Quizze bauen</h2>

          {laedt && <p style={{ color: 'var(--weiss-50)', marginTop: 12 }}>Wird geladen …</p>}

          {!laedt && quizze.length > 0 && (
            <div style={{ display: 'grid', gap: 10, margin: '18px 0 26px' }}>
              {quizze.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setQuiz(q)}
                  className="kennzahl"
                  style={{ textAlign: 'left', cursor: 'pointer', background: 'rgb(0 0 0 / .18)' }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--weiss)', fontWeight: 700, fontSize: 16.5 }}>{q.title}</span>
                    <span className={`marke ${q.is_published ? 'marke--frei' : 'marke--offen'}`}>
                      {q.is_published ? 'Veröffentlicht' : 'Entwurf'}
                    </span>
                  </span>
                  <span className="kennzahl__zusatz" style={{ display: 'block', marginTop: 6 }}>
                    {[q.chapter, q.difficulty].filter(Boolean).join(' · ') || 'Ohne Angabe'}
                  </span>
                </button>
              ))}
            </div>
          )}

          <h3 style={{ fontSize: 18, marginTop: 8 }}>Neues Quiz</h3>
          <form onSubmit={quizAnlegen} style={{ marginTop: 14 }}>
            <div className="feld">
              <label htmlFor="quiz-titel">
                Titel <span className="pflicht" aria-hidden="true">*</span>
              </label>
              <input
                id="quiz-titel"
                type="text"
                value={neuesQuiz.title}
                onChange={(e) => setNeuesQuiz({ ...neuesQuiz, title: e.target.value })}
                placeholder="z. B. Umgang mit Leitern"
                required
              />
            </div>

            <div className="feld">
              <label htmlFor="quiz-beschreibung">
                Beschreibung <span className="freiwillig">(freiwillig)</span>
              </label>
              <textarea
                id="quiz-beschreibung"
                rows={2}
                value={neuesQuiz.description}
                onChange={(e) => setNeuesQuiz({ ...neuesQuiz, description: e.target.value })}
                placeholder="Worum geht es, und für wen ist das Quiz gedacht?"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <div className="feld">
                <label htmlFor="quiz-kapitel">
                  Kapitel <span className="freiwillig">(freiwillig)</span>
                </label>
                <input
                  id="quiz-kapitel"
                  type="text"
                  value={neuesQuiz.chapter}
                  onChange={(e) => setNeuesQuiz({ ...neuesQuiz, chapter: e.target.value })}
                />
              </div>

              <div className="feld">
                <label htmlFor="quiz-schwierigkeit">Schwierigkeit</label>
                <select
                  id="quiz-schwierigkeit"
                  value={neuesQuiz.difficulty}
                  onChange={(e) => setNeuesQuiz({ ...neuesQuiz, difficulty: e.target.value })}
                >
                  <option>Einfach</option>
                  <option>Mittel</option>
                  <option>Schwer</option>
                </select>
              </div>
            </div>

            <button type="submit" className="taste taste--gelb" disabled={sendet}>
              {sendet ? 'Wird angelegt …' : 'Quiz anlegen'}
            </button>
          </form>

          {meldung && (
            <p className={`meldung${art ? ` meldung--${art}` : ''}`} role="status" aria-live="polite">
              {meldung}
            </p>
          )}
        </div>
      </section>
    );
  }

  // ---------- Ein Quiz bearbeiten ----------
  return (
    <section className="abschnitt">
      <div className="karte">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span className="ol">Ausbilder</span>
          <span className={`marke ${quiz.is_published ? 'marke--frei' : 'marke--offen'}`}>
            {quiz.is_published ? 'Veröffentlicht' : 'Entwurf'}
          </span>
        </div>

        <h2>{quiz.title}</h2>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--weiss-50)', margin: '8px 0 20px' }}>
          {fragen.length} {fragen.length === 1 ? 'Frage' : 'Fragen'} ·{' '}
          {fragen.reduce((s, f) => s + (f.punkte || 0), 0)} Punkte
        </p>

        {/* ---------- Vorhandene Fragen ---------- */}
        {fragen.length > 0 && (
          <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
            {fragen.map((f) => (
              <div
                key={f.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--rand)',
                  background: 'rgb(0 0 0 / .18)',
                }}
              >
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--signal)', minWidth: 24 }}>
                  {f.position}.
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 15 }}>{f.frage}</span>
                  <span className="kennzahl__zusatz" style={{ display: 'block', marginTop: 4 }}>
                    {TYPEN.find((t) => t.wert === f.typ)?.text || f.typ} · {f.punkte}{' '}
                    {f.punkte === 1 ? 'Punkt' : 'Punkte'}
                    {f.thw_documents?.title ? ` · ${f.thw_documents.title}` : ' · ohne Quellenangabe'}
                  </span>
                </span>
                <button
                  type="button"
                  className="taste taste--rot"
                  onClick={() => frageLoeschen(f.id)}
                  style={{ minHeight: 38, padding: '4px 14px', fontSize: 13.5 }}
                >
                  Entfernen
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ---------- Neue Frage ---------- */}
        {!formOffen ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="taste taste--gelb" onClick={() => setFormOffen(true)}>
              Frage hinzufügen
            </button>
            <button type="button" className="taste taste--klar" onClick={veroeffentlichungUmschalten}>
              {quiz.is_published ? 'Veröffentlichung zurücknehmen' : 'Veröffentlichen'}
            </button>
            <button type="button" className="taste taste--klar" onClick={() => setQuiz(null)}>
              Zurück
            </button>
          </div>
        ) : (
          <form onSubmit={frageSpeichern}>
            <h3 style={{ fontSize: 18 }}>Neue Frage</h3>

            <div className="feld">
              <label htmlFor="frage-typ">Fragetyp</label>
              <select
                id="frage-typ"
                value={entwurf.typ}
                onChange={(e) => setEntwurf({ ...leereFrage(), typ: e.target.value, frage: entwurf.frage })}
              >
                {TYPEN.map((t) => (
                  <option key={t.wert} value={t.wert}>{t.text}</option>
                ))}
              </select>
            </div>

            <div className="feld">
              <label htmlFor="frage-text">
                Frage <span className="pflicht" aria-hidden="true">*</span>
              </label>
              <textarea
                id="frage-text"
                rows={3}
                value={entwurf.frage}
                onChange={(e) => setEntwurf({ ...entwurf, frage: e.target.value })}
                placeholder={
                  entwurf.typ === 'lueckentext'
                    ? 'Der {{1}} ist ein Knoten zum Befestigen an einem Rundholz.'
                    : 'Formuliere die Frage.'
                }
                required
              />
              {entwurf.typ === 'lueckentext' && (
                <span className="kennzahl__zusatz" style={{ display: 'block', marginTop: 6 }}>
                  Setze die Lücken als <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code> … in den Text.
                  Erkannt: {lueckenAnzahl}.
                </span>
              )}
            </div>

            <Optionsfelder entwurf={entwurf} setEntwurf={setEntwurf} lueckenAnzahl={lueckenAnzahl} />

            <div className="feld">
              <label htmlFor="frage-erklaerung">
                Erklärung <span className="freiwillig">(wird nach der Antwort gezeigt)</span>
              </label>
              <textarea
                id="frage-erklaerung"
                rows={2}
                value={entwurf.erklaerung}
                onChange={(e) => setEntwurf({ ...entwurf, erklaerung: e.target.value })}
                placeholder="Warum ist das so? Ein bis zwei Sätze."
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <div className="feld">
                <label htmlFor="frage-quelle">
                  Quelle <span className="freiwillig">(aus welcher Unterlage)</span>
                </label>
                <select
                  id="frage-quelle"
                  value={entwurf.quelleDokumentId}
                  onChange={(e) => setEntwurf({ ...entwurf, quelleDokumentId: e.target.value })}
                >
                  <option value="">— keine Angabe —</option>
                  {unterlagen.map((d) => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
              </div>

              <div className="feld">
                <label htmlFor="frage-seite">
                  Seite <span className="freiwillig">(freiwillig)</span>
                </label>
                <input
                  id="frage-seite"
                  type="number"
                  min={1}
                  value={entwurf.quelleSeite}
                  onChange={(e) => setEntwurf({ ...entwurf, quelleSeite: e.target.value })}
                />
              </div>

              <div className="feld">
                <label htmlFor="frage-punkte">Punkte</label>
                <input
                  id="frage-punkte"
                  type="number"
                  min={0}
                  max={100}
                  value={entwurf.punkte}
                  onChange={(e) => setEntwurf({ ...entwurf, punkte: e.target.value })}
                />
              </div>
            </div>

            {OHNE_BEWERTUNG.includes(entwurf.typ) && (
              <p className="meldung meldung--warnung" style={{ marginBottom: 14 }}>
                Dieser Typ wird nicht maschinell bewertet. Die Antwort wird festgehalten
                und wartet auf deine Beurteilung — eine Oberfläche dafür gibt es noch nicht.
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" className="taste taste--gelb" disabled={sendet}>
                {sendet ? 'Wird gespeichert …' : 'Frage speichern'}
              </button>
              <button
                type="button"
                className="taste taste--klar"
                onClick={() => {
                  setEntwurf(leereFrage());
                  setFormOffen(false);
                  melde('');
                }}
              >
                Abbrechen
              </button>
            </div>
          </form>
        )}

        {meldung && (
          <p className={`meldung${art ? ` meldung--${art}` : ''}`} role="status" aria-live="polite">
            {meldung}
          </p>
        )}
      </div>
    </section>
  );
}

/* ==================================================================== */
/*  Antwortmoeglichkeiten und Loesung, je nach Typ                      */
/* ==================================================================== */

function Optionsfelder({ entwurf, setEntwurf, lueckenAnzahl }) {
  const { typ } = entwurf;

  // ---------- Auswahl-Typen ----------
  if (MIT_OPTIONEN.includes(typ)) {
    const istReihenfolge = typ === 'reihenfolge';
    const istMehrfach = typ === 'multiple_choice';

    function setzeOption(i, wert) {
      const neu = [...entwurf.optionen];
      neu[i] = wert;
      setEntwurf({ ...entwurf, optionen: neu });
    }

    function entferne(i) {
      const neu = entwurf.optionen.filter((unused, j) => j !== i);
      setEntwurf({
        ...entwurf,
        optionen: neu,
        loesungIndex: null,
        loesungIndizes: [],
      });
    }

    return (
      <div className="feld">
        <label>
          {istReihenfolge ? 'Schritte in der richtigen Reihenfolge' : 'Antwortmöglichkeiten'}{' '}
          <span className="pflicht" aria-hidden="true">*</span>
        </label>

        {istReihenfolge && (
          <span className="kennzahl__zusatz" style={{ display: 'block', marginBottom: 10 }}>
            Trag die Schritte hier in der <strong>richtigen</strong> Folge ein. Den
            Schülern werden sie gemischt angezeigt.
          </span>
        )}

        {entwurf.optionen.map((wert, i) => (
          <div key={`opt-${i}`} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            {!istReihenfolge && (
              <input
                type={istMehrfach ? 'checkbox' : 'radio'}
                name="loesung-auswahl"
                aria-label={`Antwort ${i + 1} ist richtig`}
                checked={
                  istMehrfach
                    ? entwurf.loesungIndizes.includes(i)
                    : entwurf.loesungIndex === i
                }
                onChange={() => {
                  if (istMehrfach) {
                    const drin = entwurf.loesungIndizes.includes(i);
                    setEntwurf({
                      ...entwurf,
                      loesungIndizes: drin
                        ? entwurf.loesungIndizes.filter((x) => x !== i)
                        : [...entwurf.loesungIndizes, i],
                    });
                  } else {
                    setEntwurf({ ...entwurf, loesungIndex: i });
                  }
                }}
              />
            )}

            {istReihenfolge && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--signal)', minWidth: 22 }}>
                {i + 1}.
              </span>
            )}

            <input
              type="text"
              value={wert}
              onChange={(e) => setzeOption(i, e.target.value)}
              placeholder={typ === 'bilderkennung' ? '/bilder/beispiel.jpg' : `Möglichkeit ${i + 1}`}
              style={{ flex: 1 }}
            />

            {entwurf.optionen.length > 2 && (
              <button
                type="button"
                className="taste taste--klar"
                onClick={() => entferne(i)}
                aria-label={`Möglichkeit ${i + 1} entfernen`}
                style={{ minHeight: 38, padding: '4px 12px', fontSize: 13.5 }}
              >
                ✕
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          className="taste taste--klar"
          onClick={() => setEntwurf({ ...entwurf, optionen: [...entwurf.optionen, ''] })}
          style={{ minHeight: 40, fontSize: 14 }}
        >
          Weitere Möglichkeit
        </button>

        {!istReihenfolge && (
          <span className="kennzahl__zusatz" style={{ display: 'block', marginTop: 10 }}>
            {istMehrfach
              ? 'Kreuze alle richtigen Antworten an.'
              : 'Markiere die richtige Antwort.'}
          </span>
        )}
      </div>
    );
  }

  // ---------- Wahr/falsch ----------
  if (typ === 'wahr_falsch') {
    return (
      <div className="feld">
        <label>
          Ist die Aussage wahr oder falsch? <span className="pflicht" aria-hidden="true">*</span>
        </label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          {[
            { wert: true, text: 'Wahr' },
            { wert: false, text: 'Falsch' },
          ].map((o) => (
            <button
              key={o.text}
              type="button"
              aria-pressed={entwurf.loesungWahr === o.wert}
              onClick={() => setEntwurf({ ...entwurf, loesungWahr: o.wert })}
              className={`taste ${entwurf.loesungWahr === o.wert ? 'taste--gelb' : 'taste--klar'}`}
              style={{ minWidth: 130 }}
            >
              {o.text}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---------- Zuordnung ----------
  if (typ === 'zuordnung') {
    const links = entwurf.links;
    const rechts = entwurf.rechts;

    function setzeSeite(seite, i, wert) {
      const neu = [...entwurf[seite]];
      neu[i] = wert;
      setEntwurf({ ...entwurf, [seite]: neu });
    }

    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div className="feld">
            <label>Begriffe links <span className="pflicht" aria-hidden="true">*</span></label>
            {links.map((wert, i) => (
              <input
                key={`li-${i}`}
                type="text"
                value={wert}
                onChange={(e) => setzeSeite('links', i, e.target.value)}
                placeholder={`Begriff ${i + 1}`}
                style={{ marginBottom: 8 }}
              />
            ))}
            <button
              type="button"
              className="taste taste--klar"
              onClick={() => setEntwurf({ ...entwurf, links: [...links, ''] })}
              style={{ minHeight: 40, fontSize: 14 }}
            >
              Weiterer Begriff
            </button>
          </div>

          <div className="feld">
            <label>Begriffe rechts <span className="pflicht" aria-hidden="true">*</span></label>
            {rechts.map((wert, i) => (
              <input
                key={`re-${i}`}
                type="text"
                value={wert}
                onChange={(e) => setzeSeite('rechts', i, e.target.value)}
                placeholder={`Begriff ${i + 1}`}
                style={{ marginBottom: 8 }}
              />
            ))}
            <button
              type="button"
              className="taste taste--klar"
              onClick={() => setEntwurf({ ...entwurf, rechts: [...rechts, ''] })}
              style={{ minHeight: 40, fontSize: 14 }}
            >
              Weiterer Begriff
            </button>
          </div>
        </div>

        <div className="feld">
          <label>Richtige Zuordnung <span className="pflicht" aria-hidden="true">*</span></label>
          {links.filter((x) => x.trim()).map((text, i) => (
            <div key={`zu-${i}`} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ minWidth: 130, fontSize: 15 }}>{text}</span>
              <span aria-hidden="true" style={{ color: 'var(--signal)' }}>→</span>
              <select
                aria-label={`Zuordnung für ${text}`}
                value={entwurf.zuordnungen[i] ?? ''}
                onChange={(e) => {
                  const neu = { ...entwurf.zuordnungen };
                  if (e.target.value === '') delete neu[i];
                  else neu[i] = e.target.value;
                  setEntwurf({ ...entwurf, zuordnungen: neu });
                }}
                style={{ flex: 1, minWidth: 150 }}
              >
                <option value="">— bitte wählen —</option>
                {rechts.filter((x) => x.trim()).map((r, j) => (
                  <option key={`zu-${i}-${j}`} value={String(j)}>{r}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </>
    );
  }

  // ---------- Lueckentext ----------
  if (typ === 'lueckentext') {
    if (lueckenAnzahl === 0) return null;

    return (
      <div className="feld">
        <label>Lösungen der Lücken <span className="pflicht" aria-hidden="true">*</span></label>
        <span className="kennzahl__zusatz" style={{ display: 'block', marginBottom: 10 }}>
          Groß- und Kleinschreibung sowie Satzzeichen am Ende spielen bei der
          Auswertung keine Rolle.
        </span>
        {Array.from({ length: lueckenAnzahl }, (unused, i) => (
          <input
            key={`lu-${i}`}
            type="text"
            value={entwurf.luecken[i] || ''}
            onChange={(e) => {
              const neu = [...entwurf.luecken];
              while (neu.length < lueckenAnzahl) neu.push('');
              neu[i] = e.target.value;
              setEntwurf({ ...entwurf, luecken: neu });
            }}
            placeholder={`Lücke ${i + 1}`}
            aria-label={`Lösung für Lücke ${i + 1}`}
            style={{ marginBottom: 8 }}
          />
        ))}
      </div>
    );
  }

  // ---------- Freitext und Fallbeispiel ----------
  if (OHNE_BEWERTUNG.includes(typ)) {
    return (
      <>
        <div className="feld">
          <label htmlFor="frage-schluessel">
            Schlüsselwörter <span className="freiwillig">(Komma getrennt, als Hilfe bei der Beurteilung)</span>
          </label>
          <input
            id="frage-schluessel"
            type="text"
            value={entwurf.schluesselwoerter}
            onChange={(e) => setEntwurf({ ...entwurf, schluesselwoerter: e.target.value })}
            placeholder="Fußpunkt, Schulterhöhe, Holm"
          />
        </div>

        <div className="feld">
          <label htmlFor="frage-muster">
            Musterantwort <span className="freiwillig">(freiwillig)</span>
          </label>
          <textarea
            id="frage-muster"
            rows={3}
            value={entwurf.musterantwort}
            onChange={(e) => setEntwurf({ ...entwurf, musterantwort: e.target.value })}
            placeholder="Wie sähe eine gute Antwort aus?"
          />
        </div>
      </>
    );
  }

  return null;
}
