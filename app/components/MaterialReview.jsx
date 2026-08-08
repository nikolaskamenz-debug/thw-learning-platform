'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabaseClient';

const MARKEN = {
  pending:  { text: 'Wartet auf Prüfung', klasse: 'marke--offen' },
  approved: { text: 'Freigegeben',        klasse: 'marke--frei' },
  rejected: { text: 'Abgelehnt',          klasse: 'marke--abgelehnt' },
};

const FILTER = [
  { wert: 'pending',  text: 'Offen' },
  { wert: 'approved', text: 'Freigegeben' },
  { wert: 'rejected', text: 'Abgelehnt' },
  { wert: 'alle',     text: 'Alle' },
];

export default function MaterialReview({ user }) {
  const [dokumente, setDokumente] = useState([]);
  const [rueckmeldung, setRueckmeldung] = useState({});
  const [meldung, setMeldung] = useState('');
  const [art, setArt] = useState('');
  const [laedt, setLaedt] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [inArbeit, setInArbeit] = useState(null);

  const istAdmin = user?.profile?.role === 'Admin';

  const laden = useCallback(async () => {
    if (!istAdmin) return;
    setLaedt(true);

    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('thw_documents')
      .select('id,title,description,chapter,page_number,status,is_approved,review_feedback,reviewed_at,created_at,uploaded_by,openai_file_id,in_knowledge_base')
      .order('created_at', { ascending: false });

    if (error) {
      setMeldung(error.message);
      setArt('fehler');
      setLaedt(false);
      return;
    }

    // Ältere Datensätze haben noch keinen Status — aus is_approved ableiten
    setDokumente(
      (data || []).map((d) => ({
        ...d,
        status: d.status || (d.is_approved ? 'approved' : 'pending'),
      })),
    );
    setLaedt(false);
  }, [istAdmin]);

  useEffect(() => { laden(); }, [laden]);

  const gefiltert = useMemo(
    () => (filter === 'alle' ? dokumente : dokumente.filter((d) => d.status === filter)),
    [dokumente, filter],
  );

  const anzahl = useMemo(
    () => ({
      pending: dokumente.filter((d) => d.status === 'pending').length,
      approved: dokumente.filter((d) => d.status === 'approved').length,
      rejected: dokumente.filter((d) => d.status === 'rejected').length,
      alle: dokumente.length,
    }),
    [dokumente],
  );

  async function pruefen(dokumentId, neuerStatus) {
    const text = (rueckmeldung[dokumentId] || '').trim();

    if (neuerStatus === 'rejected' && !text) {
      setMeldung('Bitte begründe die Ablehnung — der Ausbilder soll wissen, was fehlt.');
      setArt('fehler');
      return;
    }

    setInArbeit(dokumentId);
    setMeldung('Prüfung wird gespeichert …');
    setArt('');

    // Die Pruefung laeuft ueber den Server, nicht direkt in die
    // Datenbank: Nur dort liegt der OpenAI-Schluessel, mit dem die
    // Unterlage in die Wissensbasis eingehaengt wird. Ein Statuswechsel
    // ohne diesen Schritt waere eine Freigabe, die der KI-Ausbilder nie
    // zu sehen bekommt.
    const supabase = getSupabaseBrowserClient();
    const { data: sitzung } = await supabase.auth.getSession();
    const token = sitzung?.session?.access_token;

    if (!token) {
      setInArbeit(null);
      setMeldung('Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.');
      setArt('fehler');
      return;
    }

    let antwort;
    let daten;
    try {
      antwort = await fetch('/api/documents/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: dokumentId, status: neuerStatus, feedback: text }),
      });
      daten = await antwort.json();
    } catch {
      setInArbeit(null);
      setMeldung('Der Server war nicht erreichbar. Bitte versuche es erneut.');
      setArt('fehler');
      return;
    }

    setInArbeit(null);

    if (!antwort.ok) {
      setMeldung(daten?.error || 'Die Pruefung konnte nicht gespeichert werden.');
      setArt('fehler');
      return;
    }

    setMeldung(daten.warnung ? `${daten.message} ${daten.warnung}` : daten.message);
    setArt(daten.warnung ? 'warnung' : 'ok');
    await laden();
  }

  if (!istAdmin) return null;

  return (
    <section className="abschnitt">
      <div className="karte">
        <span className="ol">Admin</span>
        <h2>Material prüfen</h2>
        <p style={{ marginBottom: 18, fontSize: 15 }}>
          Nur freigegebene Unterlagen werden Schülern angezeigt und später als
          Wissensquelle des KI-Tutors verwendet.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {FILTER.map((f) => (
            <button
              key={f.wert}
              type="button"
              onClick={() => setFilter(f.wert)}
              className={`taste ${filter === f.wert ? 'taste--gelb' : 'taste--klar'}`}
              style={{ minHeight: 40, padding: '8px 16px', fontSize: 13.5 }}
              aria-pressed={filter === f.wert}
            >
              {f.text} ({anzahl[f.wert]})
            </button>
          ))}
        </div>

        {laedt && <p>Unterlagen werden geladen …</p>}

        {!laedt && gefiltert.length === 0 && (
          <p style={{ color: 'var(--weiss-50)' }}>
            {filter === 'pending'
              ? 'Nichts zu prüfen — alle Unterlagen sind bearbeitet.'
              : 'Keine Unterlagen in dieser Ansicht.'}
          </p>
        )}

        <div style={{ display: 'grid', gap: 14 }}>
          {gefiltert.map((dok) => {
            const marke = MARKEN[dok.status] || MARKEN.pending;
            const beschaeftigt = inArbeit === dok.id;

            return (
              <article
                key={dok.id}
                style={{
                  border: '1px solid var(--rand)',
                  borderRadius: 'var(--radius)',
                  padding: 20,
                  background: 'rgb(0 0 0 / .18)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <h3>{dok.title}</h3>
                  <span className={`marke ${marke.klasse}`}>{marke.text}</span>
                </div>

                {dok.description && (
                  <p style={{ margin: '10px 0', fontSize: 14.5 }}>{dok.description}</p>
                )}

                <p style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--weiss-50)', margin: '10px 0' }}>
                  Kapitel: {dok.chapter || '—'} · Seite: {dok.page_number || '—'}
                  {dok.openai_file_id ? ' · Datei übertragen' : ' · keine Datei hinterlegt'}
                  {dok.reviewed_at ? ` · zuletzt geprüft ${new Date(dok.reviewed_at).toLocaleDateString('de-DE')}` : ''}
                </p>

                <div className="feld" style={{ marginBottom: 12 }}>
                  <label htmlFor={`fb-${dok.id}`}>Rückmeldung an den Ausbilder</label>
                  <textarea
                    id={`fb-${dok.id}`}
                    value={rueckmeldung[dok.id] ?? dok.review_feedback ?? ''}
                    onChange={(e) =>
                      setRueckmeldung((aktuell) => ({ ...aktuell, [dok.id]: e.target.value }))
                    }
                    placeholder="Bei Ablehnung Pflicht — was muss geändert werden?"
                    rows={2}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="taste taste--gruen"
                    onClick={() => pruefen(dok.id, 'approved')}
                    disabled={beschaeftigt || dok.status === 'approved'}
                    style={{ minHeight: 42, fontSize: 14 }}
                  >
                    Freigeben
                  </button>
                  <button
                    type="button"
                    className="taste taste--rot"
                    onClick={() => pruefen(dok.id, 'rejected')}
                    disabled={beschaeftigt || dok.status === 'rejected'}
                    style={{ minHeight: 42, fontSize: 14 }}
                  >
                    Ablehnen
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <p className={`meldung${art ? ` meldung--${art}` : ''}`} role="status" aria-live="polite">
          {meldung}
        </p>
      </div>
    </section>
  );
}
