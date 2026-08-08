'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabaseClient';

export default function TrainerDashboard({ user }) {
  const [students, setStudents] = useState([]);
  const [progress, setProgress] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.id || !['Ausbilder', 'Admin'].includes(user.profile?.role)) return;

    async function load() {
      try {
        const supabase = getSupabaseBrowserClient();
        const [studentResult, progressResult, documentResult] = await Promise.all([
          supabase.from('user_profiles').select('id,name,email,role').eq('role', 'Schüler'),
          supabase.from('learning_progress').select('id,user_id,chapter,progress_percent,completed_at'),
          supabase.from('thw_documents').select('id,title,chapter,is_approved,created_at').order('created_at', { ascending: false }),
        ]);

        if (studentResult.error) throw studentResult.error;
        if (progressResult.error) throw progressResult.error;
        if (documentResult.error) throw documentResult.error;

        setStudents(studentResult.data || []);
        setProgress(progressResult.data || []);
        setDocuments(documentResult.data || []);
      } catch (err) {
        setError(err.message);
      }
    }

    load();
  }, [user?.id, user?.profile?.role]);

  const stats = useMemo(() => {
    const average = progress.length
      ? Math.round(progress.reduce((sum, row) => sum + (row.progress_percent || 0), 0) / progress.length)
      : 0;

    return {
      students: students.length,
      average,
      documents: documents.length,
      pending: documents.filter((doc) => !doc.is_approved).length,
    };
  }, [students, progress, documents]);

  if (!['Ausbilder', 'Admin'].includes(user?.profile?.role)) return null;

  return (
    <section>
      <h2>Trainer-Dashboard</h2>
      {error && <p role="alert">{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <article style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}><strong>Schüler</strong><p style={{ fontSize: 28, margin: '8px 0' }}>{stats.students}</p></article>
        <article style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}><strong>Ø Fortschritt</strong><p style={{ fontSize: 28, margin: '8px 0' }}>{stats.average}%</p></article>
        <article style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}><strong>Materialien</strong><p style={{ fontSize: 28, margin: '8px 0' }}>{stats.documents}</p></article>
        <article style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}><strong>Offene Reviews</strong><p style={{ fontSize: 28, margin: '8px 0' }}>{stats.pending}</p></article>
      </div>

      <h3 style={{ marginTop: 20 }}>Schülerübersicht</h3>
      {students.length ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {students.slice(0, 10).map((student) => {
            const rows = progress.filter((row) => row.user_id === student.id);
            const avg = rows.length ? Math.round(rows.reduce((sum, row) => sum + (row.progress_percent || 0), 0) / rows.length) : 0;
            return (
              <div key={student.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <span>{student.name || student.email}</span>
                <span>{avg}%</span>
              </div>
            );
          })}
        </div>
      ) : <p>Noch keine Schüler vorhanden.</p>}
    </section>
  );
}
