import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase environment variables are not configured');
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('learning_progress')
      .select('id,user_id,chapter,completed_at,progress_percent,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const items = data || [];
    const completed = items.filter((item) => item.completed_at || item.progress_percent >= 100).length;
    const averageProgress = items.length
      ? Math.round(items.reduce((sum, item) => sum + (item.progress_percent || 0), 0) / items.length)
      : 0;

    return NextResponse.json({
      userId,
      completed,
      total: items.length,
      averageProgress,
      items,
    });
  } catch (error) {
    console.error('Progress GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId, chapter, progressPercent = 0 } = body;

    if (!userId || !chapter) {
      return NextResponse.json({ error: 'userId and chapter required' }, { status: 400 });
    }

    const normalizedProgress = Math.max(0, Math.min(100, Number(progressPercent) || 0));
    const supabase = getSupabase();

    const { data: existing, error: lookupError } = await supabase
      .from('learning_progress')
      .select('id')
      .eq('user_id', userId)
      .eq('chapter', chapter)
      .maybeSingle();

    if (lookupError) throw lookupError;

    const payload = {
      user_id: userId,
      chapter,
      progress_percent: normalizedProgress,
      completed_at: normalizedProgress >= 100 ? new Date().toISOString() : null,
    };

    let query;
    if (existing?.id) {
      query = supabase
        .from('learning_progress')
        .update(payload)
        .eq('id', existing.id);
    } else {
      query = supabase
        .from('learning_progress')
        .insert(payload);
    }

    const { data, error } = await query.select().single();
    if (error) throw error;

    return NextResponse.json({ progress: data });
  } catch (error) {
    console.error('Progress POST Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
