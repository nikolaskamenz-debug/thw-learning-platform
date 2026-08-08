'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabaseClient';

export default function StudentDashboard({ user }) {
  const [progress, setProgress] = useState([]);
  const [quizResults, setQuizResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      if (!user?.id) return;

      setLoading(true);
      setError('');

      try {
        const supabase = getSupabaseBrowserClient();
        const [{ data: progressData, error: progressError }, { data: quizData, error: quizError }] = await Promise.all([
          supabase
            .from('learning_progress')
            .select('id,chapter,progress_percent,completed_at,created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true }),
          supabase
            .from('quiz_results')
            .select('id,quiz_id,question_number,is_correct,points,completed_at')
            .eq('user_id', user.id)
            .order('completed_at', { ascending: false })
            .limit(20),
        ]);

        if (progressError) throw progressError;
        if (quizError) throw quizError;

        if (active) {
          setProgress(progressData || []);
          setQuizResults(quizData || []);
        }
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const averageProgress = useMemo(() => {
    if (!progress.length) return 0;
    return Math.round(progress.reduce((sum, row) => sum + (row.progress_percent || 0), 0) / progress.length);
  }, [progress]);

  const completedChapters = progress.filter((row) => row.completed_at || row.progress_percent >= 100).length;
  const totalPoints = quizResults.reduce((sum, row) => sum + (row.points || 0), 0);
  const correctAnswers = quizResults.filter((row) => row.is_correct).length;
  const nextChapter = progress.find((row) => !row.completed_at && (row.progress_percent || 0) < 100);

  if (user?.profile?.role !== 'Schüler') return null;

  return (
    <section>
      <h2>Schüler-Dashboard</h2>
      <p>Willkommen, {user.profile?.name || user.email}.</p>

      {loading && <p>Dashboard wird geladen ...</p>}
      {error && <p role="alert">{error}</p>}

      {!loading && !error && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <article style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
              <strong>Lernfortschritt</strong>
              <p style={{ fontSize: 28, margin: '8px 0' }}>{averageProgress}%</p>
              <small>{completedChapters} Kapitel abgeschlossen</small>
            </article>

            <article style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
              <strong>Quiz-Punkte</strong>
              <p style={{ fontSize: 28, margin: '8px 0' }}>{totalPoints}</p>
              <small>{correctAnswers} richtige Antworten</small>
            </article>

            <article style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
              <strong>Nächstes Kapitel</strong>
              <p style={{ margin: '8px 0' }}>{nextChapter?.chapter || 'Noch nicht festgelegt'}</p>
              <small>{nextChapter ? `${nextChapter.progress_percent || 0}% bearbeitet` : 'Starte dein erstes Kapitel.'}</small>
            </article>
          </div>

          <div style={{ marginTop: 16 }}>
            <h3>Dein Lernstand</h3>
            {progress.length ? (
              progress.map((row) => (
                <div key={row.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>{row.chapter || 'Kapitel ohne Titel'}</span>
                    <span>{row.progress_percent || 0}%</span>
                  </div>
                  <progress value={row.progress_percent || 0} max="100" style={{ width: '100%' }} />
                </div>
              ))
            ) : (
              <p>Noch kein Lernfortschritt gespeichert.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
