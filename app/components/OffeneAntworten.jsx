'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabaseClient';

/**
 * Freitextantworten beurteilen — fuer Ausbilder und Admins.
 *
 * Freitext und Fallbeispiel bewertet die Datenbank bewusst nicht: Ein
 * Stichwortvergleich ist keine fachliche Beurteilung, und bei
 * Sicherheitsthemen waere ein "richtig" aufgrund von drei getroffenen
 * Woertern gefaehrlich. Die Antworten warten deshalb hier.
 *
 * Bis dieser Bildschirm existierte, warteten sie vergeblich — es gab
 * keinen Ort, an dem jemand sie haette ansehen koennen.
 */

export default function OffeneAntworten({ user }) {
  const rolle = user?.profile?.role;
  const darf = rolle === 'Ausbilder' || rolle === 'Admin';

  const [antworten, setAntworten] = useState([]);
  const [loesungen, setLoesungen] = useState({});
  const [eingaben, setEingaben] = useState({});
  const [hilfeOffen, setHilfeOffen] = useState({});
  const [laedt, setLaedt] = useState(true);
  const [inArbeit, setInArbeit] = useState(null);
  const [meldung, setMeldung] = useState('');
  const [art, setArt] = useState('');

  function melde(text, artDerMeldung = '') {
    setMeldung(text);
    setArt(artDerMeldung);
  }

  const laden = useCallback(async () => {
    setLaedt(true);
    const supabase = getSupabaseBrowserClient();

    const { data, error } = await supabase
      .from('quiz_results')
      .select(
        'id,user_answer,completed_at,question_number,frage_id,' +
          'user_profiles(name,email),' +
          'quiz_questions(frage,typ,punkte),' +
          'quizzes(title)',
      )
      .is('is_correct', null)
      .is('bewertet_am', null)
      .order('completed_at', { ascending: true });

    if (error) {
      melde(error.message, 'fehler');
      setLaedt(false);
      return;
    }

    const liste = data || [];
    setAntworten(liste);

    // Hinweise zur Beurteilung getrennt holen — quiz_loesungen ist eine
    // eigene Tabelle, weil Schueler sie nicht sehen duerfen.
    const frageIds = [...new Set(liste.map((a) => a.frage_id).filter(Boolean))];

    if (frageIds.length) {
      const { data: hilfen } = await supabase
        .from('quiz_loesungen')
        .select('frage_id,loesung')
        .in('frage_id', frageIds);

      const karte = {};
      for (const h of hilfen || []) karte[h.frage_id] = h.loesung;
      setLoesungen(karte);
    }

    setLaedt(false);
  }, []);

  useEffect(() => {
    if (darf) laden();
    else setLaedt(false);
  }, [darf, laden]);

  async function bewerten(eintrag) {
    const eingabe = eingaben[eintrag.id] || {};
    const max = eintrag.quiz_questions?.punkte ?? 0;
    const punkte = Number(eingabe.punkte);

    if (!Number.isInteger(punkte) || punkte < 0 || punkte > max) {
      melde(`Bitte vergib zwischen 0 und ${max} Punkten.`, 'fehler');
      return;
    }

    setInArbeit(eintrag.id);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.rpc('quiz_antwort_bewerten', {
      p_ergebnis_id: eintrag.id,
      p_punkte: punkte,
      p_hinweis: eingabe.hinweis || null,
    });
    setInArbeit(null);

    if (error) {
      melde(error.message, 'fehler');
      return;
    }

    melde(`Beurteilt: ${punkte} von ${max} Punkten.`, 'ok');
    await laden();
  }

  if (!darf) return null;

  return (
    <section className="abschnitt">
      <div className="karte">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span className="ol">Ausbilder</span>
          {antworten.length > 0 && (
            <span className="marke marke--offen">
              {antworten.length} {antworten.length === 1 ? 'offen' : 'offen'}
            </span>
          )}
        </div>

        <h2>Freitext beurteilen</h2>
        <p style={{ margin: '10px 0 18px', fontSize: 15 }}>
          Freitext und Fallbeispiele werden nicht maschinell bewertet. Ein
          Stichwortvergleich ist keine fachliche Beurteilung — deshalb landen
          diese Antworten hier.
        </p>

        {laedt && <p style={{ color: 'var(--weiss-50)' }}>Wird geladen …</p>}

        {!laedt && antworten.length === 0 && (
          <p style={{ color: 'var(--weiss-50)' }}>
            Nichts offen. Sobald jemand eine Freitextfrage beantwortet, steht
            sie hier.
          </p>
        )}

        <div style={{ display: 'grid', gap: 16 }}>
          {antworten.map((a) => {
            const max = a.quiz_questions?.punkte ?? 0;
            const eingabe = eingaben[a.id] || {};
            const hilfe = loesungen[a.frage_id];
            let antworttext = a.user_answer;

            try {
              const geparst = JSON.parse(a.user_answer);
              antworttext = geparst?.text ?? a.user_answer;
            } catch {
              /* dann eben roh anzeigen */
            }

            return (
              <article
                key={a.id}
                style={{
                  border: '1px solid var(--rand)',
                  borderRadius: 'var(--radius)',
                  padding: 20,
                  background: 'rgb(0 0 0 / .18)',
                }}
              >
                <p style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--weiss-50)', margin: 0 }}>
                  {a.quizzes?.title || 'Quiz'} · Frage {a.question_number} ·{' '}
                  {a.user_profiles?.name || a.user_profiles?.email || 'Unbekannt'} ·{' '}
                  {a.completed_at ? new Date(a.completed_at).toLocaleDateString('de-DE') : ''}
                </p>

                <h3 style={{ fontSize: 17, marginTop: 10 }}>{a.quiz_questions?.frage}</h3>

                <blockquote
                  style={{
                    margin: '14px 0',
                    padding: '14px 18px',
                    borderLeft: '3px solid var(--signal)',
                    background: 'rgb(255 255 255 / .05)',
                    borderRadius: '0 var(--radius) var(--radius) 0',
                    fontSize: 15.5,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {antworttext}
                </blockquote>

                {hilfe && (
                  <>
                    <button
                      type="button"
                      className="taste taste--klar"
                      onClick={() => setHilfeOffen((o) => ({ ...o, [a.id]: !o[a.id] }))}
                      aria-expanded={Boolean(hilfeOffen[a.id])}
                      style={{ minHeight: 38, padding: '4px 14px', fontSize: 13.5, marginBottom: 12 }}
                    >
                      {hilfeOffen[a.id] ? 'Hilfe ausblenden' : 'Musterantwort ansehen'}
                    </button>

                    {hilfeOffen[a.id] && (
                      <div
                        style={{
                          padding: '12px 16px',
                          marginBottom: 14,
                          border: '1px solid var(--rand)',
                          borderRadius: 'var(--radius)',
                          fontSize: 14.5,
                        }}
                      >
                        {Array.isArray(hilfe.schluesselwoerter) && hilfe.schluesselwoerter.length > 0 && (
                          <p style={{ margin: '0 0 8px' }}>
                            <strong>Schlüsselwörter:</strong> {hilfe.schluesselwoerter.join(', ')}
                          </p>
                        )}
                        {hilfe.musterantwort && (
                          <p style={{ margin: 0 }}>
                            <strong>Musterantwort:</strong> {hilfe.musterantwort}
                          </p>
                        )}
                        {!hilfe.musterantwort &&
                          (!Array.isArray(hilfe.schluesselwoerter) || hilfe.schluesselwoerter.length === 0) && (
                            <p style={{ margin: 0, color: 'var(--weiss-50)' }}>
                              Zu dieser Frage wurde keine Hilfe hinterlegt.
                            </p>
                          )}
                      </div>
                    )}
                  </>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(110px, 150px) 1fr',
                    gap: 14,
                    alignItems: 'start',
                  }}
                >
                  <div className="feld" style={{ marginBottom: 0 }}>
                    <label htmlFor={`punkte-${a.id}`}>
                      Punkte <span className="freiwillig">(0–{max})</span>
                    </label>
                    <input
                      id={`punkte-${a.id}`}
                      type="number"
                      min={0}
                      max={max}
                      value={eingabe.punkte ?? ''}
                      onChange={(e) =>
                        setEingaben((v) => ({ ...v, [a.id]: { ...v[a.id], punkte: e.target.value } }))
                      }
                    />
                  </div>

                  <div className="feld" style={{ marginBottom: 0 }}>
                    <label htmlFor={`hinweis-${a.id}`}>
                      Rückmeldung <span className="freiwillig">(freiwillig)</span>
                    </label>
                    <textarea
                      id={`hinweis-${a.id}`}
                      rows={2}
                      value={eingabe.hinweis ?? ''}
                      onChange={(e) =>
                        setEingaben((v) => ({ ...v, [a.id]: { ...v[a.id], hinweis: e.target.value } }))
                      }
                      placeholder="Was war gut, was fehlt?"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="taste taste--gruen"
                  onClick={() => bewerten(a)}
                  disabled={inArbeit === a.id}
                  style={{ marginTop: 14, minHeight: 42, fontSize: 14 }}
                >
                  {inArbeit === a.id ? 'Wird gespeichert …' : 'Beurteilung speichern'}
                </button>
              </article>
            );
          })}
        </div>

        {meldung && (
          <p className={`meldung${art ? ` meldung--${art}` : ''}`} role="status" aria-live="polite">
            {meldung}
          </p>
        )}
      </div>
    </section>
  );
}
