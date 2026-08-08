import './globals.css';

export const metadata = {
  title: 'THW Learn AI',
  description: 'Lernplattform für die THW-Ausbildung',
};

/**
 * Die Plattform ist ein eigenes Telemedienangebot: eigene Adresse, eigene
 * Konten, eigene Datenverarbeitung — bis hierher aber ohne Impressum und
 * ohne Datenschutzhinweis. Beides ist Pflicht, sobald etwas erreichbar
 * ist und personenbezogene Daten erhebt (§ 5 DDG, Art. 13 DSGVO).
 *
 * Die Texte stehen auf thw-ai.de und gelten für beides; Ziffer 9 der
 * Datenschutzerklärung beschreibt die Plattform.
 */
export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>
        {children}

        <footer className="fusszeile">
          <nav aria-label="Rechtliches">
            <a href="https://thw-ai.de/impressum.html">Impressum</a>
            <a href="https://thw-ai.de/datenschutz.html">Datenschutzerklärung</a>
            <a href="https://thw-ai.de/">Über das Projekt</a>
          </nav>
          <p>
            <strong>THW Learn AI</strong> — Lernplattform für die
            THW-Ausbildung, im geschlossenen Testbetrieb. Ein privates Projekt
            von Nikolas Kamenz. Kein Angebot der Bundesanstalt Technisches
            Hilfswerk, keiner ihrer Gliederungen und keiner Helfervereinigung.
          </p>
          <p>
            Fragen an den KI-Ausbilder werden zur Beantwortung an OpenAI
            übermittelt. Bitte keine personenbezogenen Daten eingeben —
            Einzelheiten in Ziffer 9 der Datenschutzerklärung.
          </p>
        </footer>
      </body>
    </html>
  );
}
