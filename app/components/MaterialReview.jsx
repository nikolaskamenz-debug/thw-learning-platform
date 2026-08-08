'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabaseClient';

export default function MaterialReview({ user }) {
  const [documents, setDocuments] = useState([]);
  const [feedback, setFeedback] = useState({});
  const [status, setStatus] = useState('');
  const isAdmin = user?.profile?.role === 'Admin';

  const loadDocuments = useCallback(async () => {
    if (!isAdmin) return;

    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('thw_documents')
      .select('id,title,description,chapter,page_number,is_approved,review_feedback,reviewed_at,created_at')
      .order('created_at', { ascending: false });

    if (error) {
      setStatus(error.message);
      return;
    }

    setDocuments(data || []);
  }, [isAdmin]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  async function review(documentId, approved) {
    const supabase = getSupabaseBrowserClient();
    setStatus('Review wird gespeichert ...');

    const { error } = await supabase
      .from('thw_documents')
      .update({
        is_approved: approved,
        review_feedback: feedback[documentId] || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus(approved ? 'Material genehmigt.' : 'Material abgelehnt.');
    await loadDocuments();
  }

  if (!isAdmin) return null;

  return (
    <section>
      <h2>Material Review</h2>
      <p>Prüfe hochgeladene Unterlagen und gib sie für die Lernplattform frei.</p>

      {documents.length === 0 ? (
        <p>Aktuell sind keine Materialien zur Prüfung vorhanden.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {documents.map((doc) => (
            <article key={doc.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <strong>{doc.title}</strong>
                <span>{doc.is_approved ? 'Genehmigt' : 'Offen'}</span>
              </div>
              <p>{doc.description || 'Keine Beschreibung'}</p>
              <small>
                Kapitel: {doc.chapter || '—'} · Seite: {doc.page_number || '—'}
              </small>
              <textarea
                value={feedback[doc.id] ?? doc.review_feedback ?? ''}
                onChange={(event) => setFeedback((current) => ({ ...current, [doc.id]: event.target.value }))}
                placeholder="Feedback für den Ausbilder"
                rows={3}
                style={{ display: 'block', width: '100%', margin: '12px 0' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => review(doc.id, true)}>Genehmigen</button>
                <button type="button" onClick={() => review(doc.id, false)}>Ablehnen</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {status && <p role="status">{status}</p>}
    </section>
  );
}
