'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabaseClient';

/**
 * Quiz durchspielen.
 *
 * Die vorige Fassung hatte zwei fest einprogrammierte Beispielfragen —
 * samt Loesung im Browser-Bundle, fuer jeden lesbar, der die Seitenquelle
 * oeffnet. Jetzt kommen die Fragen aus quiz_questions, und bewertet wird
 * von quiz_antwort_pruefen() in der Datenbank. Die Loesung erreicht den
 * Browser nie; zurueck kommt nur richtig/falsch, Punkte und Erklaerung.
 *
 * Alle neun Fragetypen aus dem Projektplan sind abgedeckt. Freitext und
 * Fallbeispiel bewertet die Datenbank bewusst nicht — sie kommen als
 * "bewertung_offen" zurueck und warten auf einen Ausbilder.
 */

const TYP_NAMEN = {
  single_choice: 'Eine Antwort',
  multiple_choice: 'Mehrere Antworten',
  wahr_falsch: 'Wahr oder falsch',
  reihenfolge: 'Reihenfolge',
  zuordnung: 'Zuordnung',
  freitext: 'Freitext',
  lueckentext: 'Lückentext',
  bilderkennung: 'Bild erkennen',
  fallbeispiel: 'Fallbeispiel',
};

/** Stabil mischen: gleiche Frage, gleiche Anordnung — kein Springen beim Tippen. */
function mischenStabil(anzahl, saat) {
  const felder = Array.from({ length: anzahl }, (unused, i) => i);
  let wert = 0;
  for (let i = 0; i < saat.length; i += 1) {
    wert = (wert * 31 + saat.charCodeAt(i)) >>> 0;
  }
  for (let i = felder.length - 1; i > 0; i -= 1) {
    wert = (wert * 1103515245 + 12345) >>> 0;
    const j = wert % (i + 1);
    [felder[i], felder[j]] = [felder[j], felder[i]];
  }
  return felder;
}

/** Aus "Der {{1}} ist ein Knoten." die Textstuecke und Lueckenzahl holen. */
function lueckenZerlegen(text) {
  const teile = String(text).split(/\{\{\s*\d+\s*\}\}/);
  return { teile, anzahl: teile.length - 1 };
}

export default function QuizComponent({ onComplete }) {
  const [quizze, setQuizze] = useState([]);
  const [quiz, setQuiz] = useState(null);
  const [fragen, setFragen] = useState([]);
  const [nummer, setNummer] = useState(0);
  const [antwort, setAntwort] = useState(null);
  const [rueckmeldung, setRueckmeldung] = useState(null);
  const [punkte, setPunkte] = useState(0);
  const [moeglich, setMoeglich] = useState(0);
  const [offene, setOffene] = useState(0);
  const [fertig, setFertig] = useState(false);
  const [laedt, setLaedt] = useState(true);
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState('');

  const frage = fragen[nummer] || null;

  // ---------- Quizze laden ----------
  useEffect(() => {
    let aktiv = true;

    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase
          .from('quizzes')
          .select('id,title,description,chapter,difficulty')
          .eq('is_published', true)
          .order('title');

        if (error) throw error;
        if (aktiv) setQuizze(data || []);
      } catch (err) {
        if (aktiv) setFehler(err.message);
      } finally {
        if (aktiv) setLaedt(false);
      }
    })();

    return () => {
      aktiv = false;
    };
  }, []);

  // ---------- Fragen eines Quiz laden ----------
  const quizStarten = useCallback(async (gewaehlt) => {
    setLaedt(true);
    setFehler('');

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('quiz_questions')
        .select(
          'id,position,typ,frage,optionen,punkte,quelle_seite,thw_documents(title)',
        )
        .eq('quiz_id', gewaehlt.id)
        .order('position');

      if (error) throw error;

      if (!data || data.length === 0) {
        setFehler('Zu diesem Quiz sind noch keine Fragen hinterlegt.');
        setLaedt(false);
        return;
      }

      setQuiz(gewaehlt);
      setFragen(data);
      setNummer(0);
      setAntwort(null);
      setRueckmeldung(null);
      setPunkte(0);
      setMoeglich(data.reduce((summe, f) => summe + (f.punkte || 0), 0));
      setOffene(0);
      setFertig(false);
    } catch (err) {
      setFehler(err.message);
    } finally {
      setLaedt(false);
    }
  }, []);

  // ---------- Antwort absenden ----------
  async function absenden() {
    if (!frage || antwort === null || sendet) return;

    setSendet(true);
    setFehler('');

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('quiz_antwort_pruefen', {
        p_frage_id: frage.id,
        p_antwort: antwort,
      });

      if (error) throw error;

      setRueckmeldung(data);
      setPunkte((bisher) => bisher + (data.punkte || 0));
      if (data.bewertung_offen) setOffene((bisher) => bisher + 1);
    } catch (err) {
      setFehler(err.message || 'Die Antwort konnte nicht geprüft werden.');
    } finally {
      setSendet(false);
    }
  }

  function weiter() {
    if (nummer + 1 >= fragen.length) {
      setFertig(true);
      onComplete?.({ score: punkte, total: moeglich, offen: offene });
      return;
    }
    setNummer((i) => i + 1);
    setAntwort(null);
    setRueckmeldung(null);
  }

  function zurueckZurAuswahl() {
    setQuiz(null);
    setFragen([]);
    setRueckmeldung(null);
    setAntwort(null);
    setFertig(false);
  }

  // ---------- Auswahl ----------
  if (!quiz) {
    return (
      <section className="abschnitt">
        <div className="karte">
          <span className="ol">Quiz</span>
          <h2>Wissen prüfen</h2>

          {laedt && <p style={{ color: 'var(--weiss-50)', marginTop: 12 }}>Wird geladen …</p>}

          {!laedt && fehler && (
            <p className="meldung meldung--fehler" role="status">{fehler}</p>
          )}

          {!laedt && !fehler && quizze.length === 0 && (
            <p style={{ color: 'var(--weiss-50)', margin: '12px 0 0' }}>
              Noch kein Quiz freigegeben. Sobald ein Ausbilder eines
              veröffentlicht, steht es hier.
            </p>
          )}

          {quizze.length > 0 && (
            <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
              {quizze.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => quizStarten(q)}
                  className="kennzahl"
                  style={{
                    textAlign: 'left',
                    cursor: 'pointer',
                    border: '1px solid var(--rand)',
                    background: 'rgb(0 0 0 / .18)',
                  }}
                >
                  <span style={{ color: 'var(--weiss)', fontWeight: 700, fontSize: 17 }}>
                    {q.title}
                  </span>
                  {q.description && (
                    <span style={{ display: 'block', fontSize: 14.5, marginTop: 4 }}>
                      {q.description}
                    </span>
                  )}
                  <span className="kennzahl__zusatz" style={{ display: 'block', marginTop: 6 }}>
                    {[q.chapter, q.difficulty].filter(Boolean).join(' · ') || 'Ohne Angabe'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  // ---------- Abschluss ----------
  if (fertig) {
    const anteil = moeglich > 0 ? Math.round((punkte / moeglich) * 100) : 0;

    return (
      <section className="abschnitt">
        <div className="karte karte--gelb">
          <span className="ol">Quiz</span>
          <h2>{quiz.title} — geschafft</h2>

          <p className="kennzahl__wert" style={{ margin: '16px 0 6px' }}>
            {punkte} von {moeglich}
          </p>

          <div
            className="balken"
            role="progressbar"
            aria-valuenow={anteil}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${anteil} Prozent der Punkte erreicht`}
          >
            <span style={{ width: `${anteil}%` }} />
          </div>

          <p style={{ margin: '14px 0 0', fontSize: 15 }}>
            Das sind {anteil} Prozent.
            {offene > 0 && (
              <>
                {' '}
                {offene === 1
                  ? 'Eine Antwort muss ein Ausbilder noch ansehen'
                  : `${offene} Antworten müssen Ausbilder noch ansehen`}{' '}
                — Freitext und Fallbeispiele werden nicht maschinell bewertet.
              </>
            )}
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
            <button type="button" className="taste taste--gelb" onClick={() => quizStarten(quiz)}>
              Noch einmal
            </button>
            <button type="button" className="taste taste--klar" onClick={zurueckZurAuswahl}>
              Anderes Quiz
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ---------- Laufende Frage ----------
  const anteilFortschritt = Math.round((nummer / fragen.length) * 100);
  const quelle = frage?.thw_documents?.title;

  return (
    <section className="abschnitt">
      <div className="karte">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span className="ol">{quiz.title}</span>
          <span className="marke marke--offen">{TYP_NAMEN[frage.typ] || frage.typ}</span>
        </div>

        <p style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--weiss-50)', margin: '10px 0' }}>
          Frage {nummer + 1} von {fragen.length} · {frage.punkte}{' '}
          {frage.punkte === 1 ? 'Punkt' : 'Punkte'}
        </p>

        <div className="balken" style={{ marginBottom: 20 }} aria-hidden="true">
          <span style={{ width: `${anteilFortschritt}%` }} />
        </div>

        <h3 style={{ fontSize: 20, lineHeight: 1.35 }}>
          {frage.typ === 'lueckentext' ? 'Fülle die Lücken:' : frage.frage}
        </h3>

        <div style={{ marginTop: 18 }}>
          <Eingabe
            frage={frage}
            antwort={antwort}
            setAntwort={setAntwort}
            gesperrt={Boolean(rueckmeldung)}
          />
        </div>

        {rueckmeldung && (
          <div
            className={`meldung ${
              rueckmeldung.bewertung_offen
                ? 'meldung--warnung'
                : rueckmeldung.richtig
                  ? 'meldung--ok'
                  : 'meldung--fehler'
            }`}
            role="status"
            aria-live="polite"
            style={{ marginTop: 18 }}
          >
            {rueckmeldung.bewertung_offen
              ? 'Antwort festgehalten. Ein Ausbilder sieht sie sich an — Freitext wird nicht maschinell bewertet.'
              : rueckmeldung.richtig
                ? `Richtig. ${rueckmeldung.punkte} von ${rueckmeldung.moegliche_punkte} Punkten.`
                : 'Das war nicht richtig.'}
          </div>
        )}

        {rueckmeldung?.erklaerung && (
          <p
            style={{
              marginTop: 12,
              fontSize: 15,
              padding: '12px 16px',
              background: 'rgb(255 255 255 / .06)',
              border: '1px solid var(--rand)',
              borderRadius: 'var(--radius)',
            }}
          >
            {rueckmeldung.erklaerung}
          </p>
        )}

        {quelle && rueckmeldung && (
          <p className="marke marke--offen" style={{ marginTop: 12 }}>
            Quelle: {quelle}
            {frage.quelle_seite ? `, S. ${frage.quelle_seite}` : ''}
          </p>
        )}

        {fehler && (
          <p className="meldung meldung--fehler" role="status">{fehler}</p>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
          {!rueckmeldung ? (
            <button
              type="button"
              className="taste taste--gelb"
              onClick={absenden}
              disabled={antwort === null || sendet}
            >
              {sendet ? 'Wird geprüft …' : 'Antwort abgeben'}
            </button>
          ) : (
            <button type="button" className="taste taste--gelb" onClick={weiter}>
              {nummer + 1 >= fragen.length ? 'Quiz abschließen' : 'Nächste Frage'}
            </button>
          )}

          <button type="button" className="taste taste--klar" onClick={zurueckZurAuswahl}>
            Abbrechen
          </button>
        </div>
      </div>
    </section>
  );
}

/* ==================================================================== */
/*  Eingabemasken je Fragetyp                                           */
/* ==================================================================== */

function Eingabe({ frage, antwort, setAntwort, gesperrt }) {
  switch (frage.typ) {
    case 'single_choice':
    case 'bilderkennung':
      return (
        <EineAntwort
          frage={frage}
          antwort={antwort}
          setAntwort={setAntwort}
          gesperrt={gesperrt}
          mitBild={frage.typ === 'bilderkennung'}
        />
      );

    case 'multiple_choice':
      return <MehrereAntworten frage={frage} antwort={antwort} setAntwort={setAntwort} gesperrt={gesperrt} />;

    case 'wahr_falsch':
      return <WahrFalsch antwort={antwort} setAntwort={setAntwort} gesperrt={gesperrt} />;

    case 'reihenfolge':
      return <Reihenfolge frage={frage} antwort={antwort} setAntwort={setAntwort} gesperrt={gesperrt} />;

    case 'zuordnung':
      return <Zuordnung frage={frage} antwort={antwort} setAntwort={setAntwort} gesperrt={gesperrt} />;

    case 'lueckentext':
      return <Lueckentext frage={frage} antwort={antwort} setAntwort={setAntwort} gesperrt={gesperrt} />;

    case 'freitext':
    case 'fallbeispiel':
      return <Freitext frage={frage} antwort={antwort} setAntwort={setAntwort} gesperrt={gesperrt} />;

    default:
      return (
        <p className="meldung meldung--fehler">
          Dieser Fragetyp wird noch nicht dargestellt: {frage.typ}
        </p>
      );
  }
}

const auswahlStil = (aktiv) => ({
  display: 'block',
  padding: '13px 16px',
  marginBottom: 10,
  borderRadius: 'var(--radius)',
  border: `1px solid ${aktiv ? 'var(--signal)' : 'var(--rand)'}`,
  background: aktiv ? 'rgb(245 196 0 / .12)' : 'rgb(0 0 0 / .18)',
  cursor: 'pointer',
  fontSize: 15.5,
  lineHeight: 1.4,
});

function EineAntwort({ frage, antwort, setAntwort, gesperrt, mitBild }) {
  const optionen = Array.isArray(frage.optionen) ? frage.optionen : [];
  const gewaehlt = antwort?.index;

  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
      <legend className="visuell-versteckt">{frage.frage}</legend>
      {optionen.map((text, i) => (
        <label key={`${frage.id}-${i}`} style={auswahlStil(gewaehlt === String(i))}>
          <input
            type="radio"
            name={`frage-${frage.id}`}
            checked={gewaehlt === String(i)}
            disabled={gesperrt}
            onChange={() => setAntwort({ index: String(i) })}
            style={{ marginRight: 10 }}
          />
          {mitBild ? (
            <img
              src={text}
              alt={`Antwortmöglichkeit ${i + 1}`}
              style={{ maxWidth: '100%', borderRadius: 8, marginTop: 8, display: 'block' }}
            />
          ) : (
            text
          )}
        </label>
      ))}
    </fieldset>
  );
}

function MehrereAntworten({ frage, antwort, setAntwort, gesperrt }) {
  const optionen = Array.isArray(frage.optionen) ? frage.optionen : [];
  const gewaehlt = antwort?.indizes || [];

  function umschalten(i) {
    const wert = String(i);
    const neu = gewaehlt.includes(wert)
      ? gewaehlt.filter((x) => x !== wert)
      : [...gewaehlt, wert];
    setAntwort(neu.length ? { indizes: neu } : null);
  }

  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
      <legend style={{ fontSize: 13.5, color: 'var(--weiss-50)', marginBottom: 10 }}>
        Mehrere Antworten möglich — alle richtigen müssen angekreuzt sein.
      </legend>
      {optionen.map((text, i) => (
        <label key={`${frage.id}-${i}`} style={auswahlStil(gewaehlt.includes(String(i)))}>
          <input
            type="checkbox"
            checked={gewaehlt.includes(String(i))}
            disabled={gesperrt}
            onChange={() => umschalten(i)}
            style={{ marginRight: 10 }}
          />
          {text}
        </label>
      ))}
    </fieldset>
  );
}

function WahrFalsch({ antwort, setAntwort, gesperrt }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {[
        { wert: true, text: 'Wahr' },
        { wert: false, text: 'Falsch' },
      ].map((o) => (
        <button
          key={o.text}
          type="button"
          disabled={gesperrt}
          aria-pressed={antwort?.wahr === o.wert}
          onClick={() => setAntwort({ wahr: o.wert })}
          className={`taste ${antwort?.wahr === o.wert ? 'taste--gelb' : 'taste--klar'}`}
          style={{ minWidth: 130 }}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

function Reihenfolge({ frage, antwort, setAntwort, gesperrt }) {
  const optionen = useMemo(
    () => (Array.isArray(frage.optionen) ? frage.optionen : []),
    [frage.optionen],
  );

  // Gemischt anzeigen — sonst steht die Loesung schon in der Liste.
  const startfolge = useMemo(
    () => mischenStabil(optionen.length, frage.id),
    [optionen.length, frage.id],
  );

  const folge = antwort?.reihenfolge
    ? antwort.reihenfolge.map((x) => Number(x))
    : startfolge;

  useEffect(() => {
    if (!antwort && optionen.length) {
      setAntwort({ reihenfolge: startfolge.map(String) });
    }
  }, [antwort, optionen.length, startfolge, setAntwort]);

  function schieben(von, nach) {
    if (nach < 0 || nach >= folge.length) return;
    const neu = [...folge];
    [neu[von], neu[nach]] = [neu[nach], neu[von]];
    setAntwort({ reihenfolge: neu.map(String) });
  }

  return (
    <div>
      <p style={{ fontSize: 13.5, color: 'var(--weiss-50)', marginBottom: 12 }}>
        Bring die Schritte mit den Pfeilen in die richtige Reihenfolge.
      </p>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {folge.map((originalIndex, platz) => (
          <li
            key={`${frage.id}-${originalIndex}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              marginBottom: 10,
              borderRadius: 'var(--radius)',
              border: '1px solid var(--rand)',
              background: 'rgb(0 0 0 / .18)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 13,
                color: 'var(--signal)',
                minWidth: 22,
              }}
            >
              {platz + 1}.
            </span>
            <span style={{ flex: 1, fontSize: 15.5 }}>{optionen[originalIndex]}</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="taste taste--klar"
                disabled={gesperrt || platz === 0}
                onClick={() => schieben(platz, platz - 1)}
                aria-label={`„${optionen[originalIndex]}" nach oben`}
                style={{ minHeight: 38, padding: '4px 12px', fontSize: 14 }}
              >
                ↑
              </button>
              <button
                type="button"
                className="taste taste--klar"
                disabled={gesperrt || platz === folge.length - 1}
                onClick={() => schieben(platz, platz + 1)}
                aria-label={`„${optionen[originalIndex]}" nach unten`}
                style={{ minHeight: 38, padding: '4px 12px', fontSize: 14 }}
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Zuordnung({ frage, antwort, setAntwort, gesperrt }) {
  const links = frage.optionen?.links || [];
  const rechts = frage.optionen?.rechts || [];
  const paare = antwort?.paare || [];

  function setzen(linksIndex, rechtsWert) {
    const ohne = paare.filter((p) => String(p[0]) !== String(linksIndex));
    const neu =
      rechtsWert === ''
        ? ohne
        : [...ohne, [String(linksIndex), String(rechtsWert)]];
    setAntwortSicher(neu);
  }

  function setAntwortSicher(neu) {
    setAntwort(neu.length ? { paare: neu } : null);
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ fontSize: 13.5, color: 'var(--weiss-50)', margin: 0 }}>
        Ordne jedem Begriff links den passenden rechts zu.
      </p>
      {links.map((text, i) => {
        const treffer = paare.find((p) => String(p[0]) === String(i));
        const feldId = `zuordnung-${frage.id}-${i}`;
        return (
          <div key={feldId} className="feld" style={{ marginBottom: 0 }}>
            <label htmlFor={feldId}>{text}</label>
            <select
              id={feldId}
              disabled={gesperrt}
              value={treffer ? String(treffer[1]) : ''}
              onChange={(e) => setzen(i, e.target.value)}
            >
              <option value="">— bitte wählen —</option>
              {rechts.map((r, j) => (
                <option key={`${feldId}-${j}`} value={String(j)}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function Lueckentext({ frage, antwort, setAntwort, gesperrt }) {
  const { teile, anzahl } = useMemo(() => lueckenZerlegen(frage.frage), [frage.frage]);
  const luecken = antwort?.luecken || Array.from({ length: anzahl }, () => '');

  function schreiben(i, wert) {
    const neu = [...luecken];
    while (neu.length < anzahl) neu.push('');
    neu[i] = wert;
    setAntwort(neu.some((x) => x.trim()) ? { luecken: neu } : null);
  }

  return (
    <p style={{ fontSize: 16.5, lineHeight: 2.1 }}>
      {teile.map((stueck, i) => (
        <span key={`${frage.id}-teil-${i}`}>
          {stueck}
          {i < anzahl && (
            <input
              type="text"
              value={luecken[i] || ''}
              disabled={gesperrt}
              onChange={(e) => schreiben(i, e.target.value)}
              aria-label={`Lücke ${i + 1}`}
              style={{
                display: 'inline-block',
                width: 'clamp(110px, 26%, 220px)',
                margin: '0 6px',
                padding: '6px 10px',
                fontSize: 15.5,
                fontFamily: 'var(--disp)',
                color: 'var(--weiss)',
                background: 'rgb(0 0 0 / .3)',
                border: '1px solid var(--rand)',
                borderBottom: '2px solid var(--signal)',
                borderRadius: 8,
              }}
            />
          )}
        </span>
      ))}
    </p>
  );
}

function Freitext({ frage, antwort, setAntwort, gesperrt }) {
  return (
    <div className="feld" style={{ marginBottom: 0 }}>
      <label htmlFor={`freitext-${frage.id}`}>
        Deine Antwort{' '}
        <span className="freiwillig">(wird von einem Ausbilder angesehen)</span>
      </label>
      <textarea
        id={`freitext-${frage.id}`}
        rows={6}
        disabled={gesperrt}
        value={antwort?.text || ''}
        onChange={(e) => setAntwort(e.target.value.trim() ? { text: e.target.value } : null)}
        placeholder="Beschreibe dein Vorgehen in eigenen Worten."
      />
    </div>
  );
}
