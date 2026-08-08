'use client';

import { useEffect, useRef, useState } from 'react';

export default function ChatInterface() {
  const [nachrichten, setNachrichten] = useState([]);
  const [eingabe, setEingabe] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const verlaufRef = useRef(null);

  useEffect(() => {
    if (verlaufRef.current) {
      verlaufRef.current.scrollTop = verlaufRef.current.scrollHeight;
    }
  }, [nachrichten, laeuft]);

  async function senden() {
    const frage = eingabe.trim();
    if (!frage || laeuft) return;

    setNachrichten((bisher) => [...bisher, { rolle: 'nutzer', text: frage }]);
    setEingabe('');
    setLaeuft(true);

    try {
      const antwort = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: frage }),
      });
      const daten = await antwort.json();

      if (!antwort.ok) throw new Error(daten.error || 'Der KI-Ausbilder antwortet gerade nicht.');

      setNachrichten((bisher) => [
        ...bisher,
        { rolle: 'ki', text: daten.response, quellen: daten.sources || null },
      ]);
    } catch (fehler) {
      setNachrichten((bisher) => [...bisher, { rolle: 'fehler', text: fehler.message }]);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <section className="abschnitt">
      <div className="karte">
        <span className="ol">KI-Ausbilder</span>
        <h2>Frag nach</h2>
        <p style={{ margin: '10px 0 18px', fontSize: 15 }}>
          Stell deine Frage zur Ausbildung. Antworten sollen künftig Dokument,
          Kapitel und Seite nennen — solange die Wissensbasis noch nicht
          angebunden ist, antwortet der Assistent ohne Quellenangabe.
        </p>

        <div
          ref={verlaufRef}
          style={{
            minHeight: 220,
            maxHeight: 420,
            overflowY: 'auto',
            background: 'rgb(0 0 0 / .22)',
            border: '1px solid var(--rand)',
            borderRadius: 'var(--radius)',
            padding: 16,
            marginBottom: 14,
          }}
          aria-live="polite"
        >
          {nachrichten.length === 0 && !laeuft && (
            <p style={{ color: 'var(--weiss-50)', fontSize: 14.5 }}>
              Noch keine Frage gestellt. Zum Beispiel: „Wie wird ein
              Leitungsroller richtig aufgebaut?"
            </p>
          )}

          {nachrichten.map((n, i) => {
            const istNutzer = n.rolle === 'nutzer';
            const istFehler = n.rolle === 'fehler';

            return (
              <div
                key={i}
                style={{
                  maxWidth: '88%',
                  marginLeft: istNutzer ? 'auto' : 0,
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    letterSpacing: '.1em',
                    textTransform: 'uppercase',
                    color: 'var(--weiss-50)',
                    marginBottom: 5,
                    textAlign: istNutzer ? 'right' : 'left',
                  }}
                >
                  {istNutzer ? 'Du' : istFehler ? 'Fehler' : 'KI-Ausbilder'}
                </div>
                <div
                  style={{
                    padding: '11px 15px',
                    borderRadius: 14,
                    fontSize: 14.5,
                    lineHeight: 1.55,
                    background: istNutzer
                      ? 'var(--signal)'
                      : istFehler
                        ? 'var(--rot-feld)'
                        : 'rgb(255 255 255 / .07)',
                    color: istNutzer ? 'var(--nacht)' : istFehler ? 'var(--rot)' : 'var(--weiss-70)',
                    border: istNutzer ? 'none' : '1px solid var(--rand)',
                    fontWeight: istNutzer ? 500 : 400,
                    borderBottomRightRadius: istNutzer ? 5 : 14,
                    borderBottomLeftRadius: istNutzer ? 14 : 5,
                  }}
                >
                  {n.text}
                  {n.quellen && (
                    <div className="marke marke--offen" style={{ marginTop: 10 }}>
                      Quelle: {n.quellen}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {laeuft && (
            <p style={{ color: 'var(--weiss-50)', fontFamily: 'var(--mono)', fontSize: 12 }}>
              Der KI-Ausbilder denkt nach …
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                senden();
              }
            }}
            placeholder="Frag den KI-Ausbilder …"
            disabled={laeuft}
            aria-label="Deine Frage"
            style={{
              flex: '1 1 240px',
              fontFamily: 'var(--disp)',
              fontSize: 15,
              color: 'var(--weiss)',
              background: 'rgb(0 0 0 / .28)',
              border: '1px solid var(--rand)',
              borderRadius: 11,
              padding: '12px 14px',
              minHeight: 48,
            }}
          />
          <button
            type="button"
            onClick={senden}
            disabled={laeuft || !eingabe.trim()}
            className="taste taste--gelb"
          >
            {laeuft ? 'Läuft …' : 'Fragen'}
          </button>
        </div>
      </div>
    </section>
  );
}
