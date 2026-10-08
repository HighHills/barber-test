import { NextRequest, NextResponse } from 'next/server';
import { activationCode, activationExpiresAt, isValidActivationCode } from '../../../lib/mobile-activation';
import { createServerSupabaseClient } from '../../../lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

function deploymentConfig() {
  const secret = process.env.MOBILE_ACTIVATION_SECRET || '';
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  let publicKey = supabaseAnonKey.startsWith('sb_publishable_');
  if (!publicKey && supabaseAnonKey.includes('.')) {
    try {
      publicKey = JSON.parse(Buffer.from(supabaseAnonKey.split('.')[1], 'base64url').toString('utf8')).role === 'anon';
    } catch { /* malformed legacy JWT */ }
  }
  if (secret.length < 32 || !supabaseUrl || !publicKey) return null;
  return { secret, supabaseUrl, supabaseAnonKey };
}

export async function GET() {
  const config = deploymentConfig();
  if (!config) return NextResponse.json({ error: 'Aktivasi APK belum dikonfigurasi di deployment web.' }, { status: 503, headers });

  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Silakan login sebagai Owner.' }, { status: 401, headers });

  const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).eq('is_active', true).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Akses Owner diperlukan.' }, { status: 403, headers });

  const { data: assignments, error: roleError } = await supabase
    .from('user_roles')
    .select('outlet_id, roles(code, is_active)')
    .eq('user_id', profile.id);
  if (roleError || !assignments?.some((assignment) => {
    const roles = Array.isArray(assignment.roles) ? assignment.roles : [assignment.roles];
    return assignment.outlet_id === null && roles.some((role) => role?.code === 'OWNER' && role.is_active);
  })) return NextResponse.json({ error: 'Akses Owner diperlukan.' }, { status: 403, headers });

  return NextResponse.json({ code: activationCode(config.secret), expiresAt: activationExpiresAt() }, { headers });
}

export async function POST(request: NextRequest) {
  const config = deploymentConfig();
  if (!config) return NextResponse.json({ error: 'Aktivasi APK belum dikonfigurasi di deployment web.' }, { status: 503, headers });
  const body = await request.json().catch(() => null);
  if (!isValidActivationCode(body?.code, config.secret)) {
    return NextResponse.json({ error: 'Kode aktivasi salah atau kedaluwarsa.' }, { status: 400, headers });
  }
  // Only public client configuration is returned; this endpoint grants no account access.
  return NextResponse.json({ supabaseUrl: config.supabaseUrl, supabaseAnonKey: config.supabaseAnonKey }, { headers });
}
