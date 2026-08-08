'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabaseClient';

/**
 * Konten freischalten — fuer Admins.
 *
 * Vorher bekam jeder, der sich registriert hat, sofort die Rolle
 * "Schueler" und damit Zugriff auf alle 156 Ausbildungsunterlagen und
 * den KI-Ausbilder. Es reichte eine E-Mail-Adresse.
 *
 * Jetzt wartet ein neues Konto hier. Der Admin vergibt beim Freischalten
 * auch die Rolle — wer sich bei der Registrierung als Ausbilder
 * bezeichnet, ist damit noch keiner.
 */

const ROLLEN = ['Schüler', 'Ausbilder', 'Admin'];

export default function Benutzerfreigabe({ user }) {
  const istAdmin = user?.profile?.role === 'Admin';

  const [leute, setLeute] = useState([]);
  const [rollenwahl, setRollenwahl] = useState({});
  const [ansicht, setAnsicht] = useState('wartend');
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
      .from('user_profiles')
      .select('id,email,name,role,freigeschaltet,gewuenschte_rolle,ortsverband,registriert_am,freigeschaltet_am')
      .order('registriert_am', { ascending: false });

    if (error) {
      melde(error.message, 'fehler');
    } else {
      setLeute(data || []);
    }
    setLaedt(false);
  }, []);

  useEffect(() => {
    if (istAdmin) laden();
    else setLaedt(false);
  }, [istAdmin, laden]);

  const wartend = useMemo(() => leute.filter((l) => !l.freigeschaltet), [leute]);
  const frei = useMemo(() => leute.filter((l) => l.freigeschaltet), [leute]);
  const sichtbar = ansicht === 'wartend' ? wartend : frei;

  async function freischalten(person) {
    const rolle = rollenwahl[person.id] || person.gewuenschte_rolle || 'Schüler';

    if (!ROLLEN.includes(rolle)) {
      melde('Bitte eine Rolle wählen.', 'fehler');
      return;
    }

    setInArbeit(person.id);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.rpc('benutzer_freischalten', {
      p_id: person.id,
      p_rolle: rolle,
    });
    setInArbeit(null);

    if (error) {
      melde(error.message, 'fehler');
      return;
    }

    melde(`${person.name || person.email} ist freigeschaltet — als ${rolle}.`, 'ok');
    await laden();
  }

  async function sperren(person) {
    setInArbeit(person.id);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.rpc('benutzer_sperren', { p_id: person.id });
    setInArbeit(null);

    if (error) {
      melde(error.message, 'fehler');
      return;
    }

    melde(`${person.name || person.email} hat keinen Zugang mehr.`, 'ok');
    await laden();
  }

  if (!istAdmin) return null;

  return (
    <section className="abschnitt">
      <div className="karte">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span className="ol">Admin</span>
          {wartend.length > 0 && (
            <span className="marke marke--offen">
              {wartend.length} {wartend.length === 1 ? 'wartet' : 'warten'}
            </span>
          )}
        </div>

        <h2>Zugänge verwalten</h2>
        <p style={{ margin: '10px 0 18px', fontSize: 15 }}>
          Wer sich registriert, wartet hier auf Freischaltung. Erst dann sieht
          die Person Unterlagen, Quizze und den KI-Ausbilder. Die Rolle vergibst
          du beim Freischalten.
        </p>

        {wartend.length > 0 && ansicht !== 'wartend' && (
          <p className="meldung meldung--warnung" style={{ marginBottom: 16 }}>
            {wartend.length === 1
              ? 'Eine Person wartet auf Freischaltung.'
              : `${wartend.length} Personen warten auf Freischaltung.`}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {[
            { wert: 'wartend', text: 'Wartet', anzahl: wartend.length },
            { wert: 'frei', text: 'Freigeschaltet', anzahl: frei.length },
          ].map((f) => (
            <button
              key={f.wert}
              type="button"
              onClick={() => setAnsicht(f.wert)}
              className={`taste ${ansicht === f.wert ? 'taste--gelb' : 'taste--klar'}`}
              style={{ minHeight: 40, padding: '8px 16px', fontSize: 13.5 }}
              aria-pressed={ansicht === f.wert}
            >
              {f.text} ({f.anzahl})
            </button>
          ))}
        </div>

        {laedt && <p style={{ color: 'var(--weiss-50)' }}>Wird geladen …</p>}

        {!laedt && sichtbar.length === 0 && (
          <p style={{ color: 'var(--weiss-50)' }}>
            {ansicht === 'wartend'
              ? 'Niemand wartet. Neue Registrierungen erscheinen hier.'
              : 'Noch niemand freigeschaltet.'}
          </p>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {sichtbar.map((person) => {
            const selbst = person.id === user.id;
            const beschaeftigt = inArbeit === person.id;

            return (
              <article
                key={person.id}
                style={{
                  border: '1px solid var(--rand)',
                  borderRadius: 'var(--radius)',
                  padding: 18,
                  background: 'rgb(0 0 0 / .18)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ color: 'var(--weiss)', fontWeight: 700, fontSize: 16.5, margin: 0 }}>
                      {person.name || '(ohne Namen)'}
                      {selbst && (
                        <span className="kennzahl__zusatz" style={{ marginLeft: 8 }}>— das bist du</span>
                      )}
                    </p>
                    <p style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--weiss-50)', margin: '4px 0 0' }}>
                      {person.email}
                    </p>
                  </div>
                  {person.freigeschaltet && (
                    <span className={`marke ${person.role === 'Admin' ? 'marke--frei' : 'marke--offen'}`}>
                      {person.role}
                    </span>
                  )}
                </div>

                <p style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--weiss-50)', margin: '10px 0 0' }}>
                  {person.ortsverband ? `OV ${person.ortsverband} · ` : ''}
                  {person.gewuenschte_rolle ? `möchte ${person.gewuenschte_rolle} sein · ` : ''}
                  registriert{' '}
                  {person.registriert_am
                    ? new Date(person.registriert_am).toLocaleDateString('de-DE')
                    : '—'}
                </p>

                {!person.freigeschaltet ? (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 14 }}>
                    <div className="feld" style={{ marginBottom: 0, minWidth: 160 }}>
                      <label htmlFor={`rolle-${person.id}`}>Rolle vergeben</label>
                      <select
                        id={`rolle-${person.id}`}
                        value={rollenwahl[person.id] || person.gewuenschte_rolle || 'Schüler'}
                        onChange={(e) =>
                          setRollenwahl((v) => ({ ...v, [person.id]: e.target.value }))
                        }
                      >
                        {ROLLEN.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="taste taste--gruen"
                      onClick={() => freischalten(person)}
                      disabled={beschaeftigt}
                      style={{ minHeight: 46, fontSize: 14 }}
                    >
                      {beschaeftigt ? 'Läuft …' : 'Freischalten'}
                    </button>
                  </div>
                ) : (
                  !selbst && (
                    <button
                      type="button"
                      className="taste taste--rot"
                      onClick={() => sperren(person)}
                      disabled={beschaeftigt}
                      style={{ marginTop: 14, minHeight: 40, padding: '6px 16px', fontSize: 13.5 }}
                    >
                      {beschaeftigt ? 'Läuft …' : 'Zugang entziehen'}
                    </button>
                  )
                )}
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
