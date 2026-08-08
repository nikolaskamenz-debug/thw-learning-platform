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
      .from('progress')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    const rows = data || [];
    const completed = rows.filter((row) => row.completed === true || row.status === 'completed').length;

    return NextResponse.json({
      userId,
      completed,
      total: rows.length,
      items: rows,
    });
  } catch (error) {
    console.error('Progress GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId, moduleId, completed = false, score = null } = body;

    if (!userId || !moduleId) {
      return NextResponse.json({ error: 'userId and moduleId required' }, { status: 400 });
    }

    const supabase = getSupabase();
    const payload = {
      user_id: userId,
      module_id: moduleId,
      completed,
      score,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('progress')
      .upsert(payload, { onConflict: 'user_id,module_id' })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ progress: data });
  } catch (error) {
    console.error('Progress POST Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
