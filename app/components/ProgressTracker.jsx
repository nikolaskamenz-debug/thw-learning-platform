'use client';

import { useCallback, useEffect, useState } from 'react';

export default function ProgressTracker({ userId }) {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  const loadProgress = useCallback(async () => {
    if (!userId) return;

    try {
      setError('');
      const response = await fetch(`/api/progress?userId=${encodeURIComponent(userId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Fortschritt konnte nicht geladen werden');
      setProgress(data);
    } catch (err) {
      setError(err.message);
    }
  }, [userId]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  if (!userId) return <section><h2>Lernfortschritt</h2><p>Kein Benutzer ausgewählt.</p></section>;
  if (error) return <section><h2>Lernfortschritt</h2><p>{error}</p></section>;
  if (!progress) return <section><h2>Lernfortschritt</h2><p>Wird geladen ...</p></section>;

  const percentage = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  return (
    <section>
      <h2>Lernfortschritt</h2>
      <progress value={percentage} max="100">{percentage}%</progress>
      <p>{percentage}% abgeschlossen ({progress.completed} von {progress.total})</p>
      <button type="button" onClick={loadProgress}>Aktualisieren</button>
    </section>
  );
}
