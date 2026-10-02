import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function isOriginAllowed(origin: string | undefined, hostHeader?: string): boolean {
  if (!origin) return true;
  try {
    const originHost = new URL(origin).hostname.toLowerCase();
    const cleanHost = (hostHeader || '').split(':')[0].trim().toLowerCase();

    if (cleanHost && (originHost === cleanHost || originHost.endsWith('.' + cleanHost) || cleanHost.endsWith('.' + originHost))) {
      return true;
    }

    return (
      originHost === 'sectorsevencyber.com' ||
      originHost.endsWith('.sectorsevencyber.com') ||
      originHost === 'localhost' ||
      originHost === '127.0.0.1' ||
      originHost.endsWith('.vercel.app')
    );
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const hostHeader = (req.headers['x-forwarded-host'] as string) || (req.headers.host as string) || '';
  const origin = req.headers.origin as string | undefined;

  if (origin && isOriginAllowed(origin, hostHeader)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { applicationId } = req.body || {};

  if (!applicationId || typeof applicationId !== 'string') {
    return res.status(400).json({ error: 'Valid applicationId parameter is required.' });
  }

  const cleanAppId = applicationId.trim();
  if (!/^[a-zA-Z0-9_\-]+$/.test(cleanAppId)) {
    return res.status(400).json({ error: 'Invalid applicationId format.' });
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://lmexwjocppravvmtwvzc.supabase.co';

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    '';

  if (!serviceKey) {
    console.error('Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing.');
    return res.status(500).json({ error: 'Internal configuration error.' });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Fetch verified application record directly from server database
    const { data: appRecord, error: appErr } = await supabaseAdmin
      .from('applications')
      .select('*')
      .eq('id', cleanAppId)
      .single();

    let activeRecord = appRecord;

    if (appErr || !activeRecord) {
      const { companyName, email, contactName, deviceCount: bodyDev, cloudUserCount: bodyCloud } = req.body || {};
      if (companyName && email) {
        const dCount = Number(bodyDev) || 1;
        const cCount = Number(bodyCloud) || 0;
        activeRecord = {
          id: cleanAppId,
          company_name: companyName,
          email: email,
          contact_name: contactName || 'Authorized Representative',
          device_count: dCount,
          cloud_user_count: cCount,
          evaluating_quantity: Math.max(dCount, cCount),
          is_custom_quote: Math.max(dCount, cCount) > 30,
          status: 'ACTIVATION STARTED',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        try {
          await supabaseAdmin.from('applications').upsert([activeRecord]);
        } catch (upsertErr) {
          console.warn('Upsert fallback warning:', upsertErr);
        }
      } else {
        return res.status(404).json({ error: 'Application record not found for specified ID.' });
      }
    }

    // Check if custom quote is required (Section 9 & 10 of Master Specification)
    const deviceCount = Number(activeRecord.device_count) || 1;
    const cloudUserCount = Number(activeRecord.cloud_user_count) || 0;
    const evaluatingQty = Math.max(deviceCount, cloudUserCount);

    if (evaluatingQty > 30 || activeRecord.is_custom_quote) {
      return res.status(400).json({
        error:
          'Your environment requires a customized Sector Seven quote. Submit your information and our team will contact you regarding pricing.',
      });
    }

    // Verify rate against master pricing bands:
    // 1–10: $500/month | 11–20: $750/month | 21–30: $1,000/month
    let verifiedMonthlyRate = 500;
    if (evaluatingQty <= 10) {
      verifiedMonthlyRate = 500;
    } else if (evaluatingQty <= 20) {
      verifiedMonthlyRate = 750;
    } else if (evaluatingQty <= 30) {
      verifiedMonthlyRate = 1000;
    }

    const stripeKey = (
      process.env.STRIPE_SECRET_KEY ||
      process.env.STRIPESANDBOX_SECRET_KEY ||
      process.env.VITE_STRIPE_SECRET_KEY ||
      ''
    ).trim();

    if (!stripeKey) {
      console.error('Stripe Secret Key not configured in environment.');
      return res.status(500).json({
        error: 'Payment gateway configuration error. STRIPE_SECRET_KEY is not configured in Vercel project environment variables.',
      });
    }

    let requestOrigin = origin;
    if (!requestOrigin && req.headers.referer) {
      try {
        requestOrigin = new URL(req.headers.referer as string).origin;
      } catch {
        // ignore
      }
    }

    const siteUrl = (
      requestOrigin ||
      process.env.SITE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.VITE_SITE_URL ||
      'https://sectorsevencyber.vercel.app'
    ).trim().replace(/\/+$/, '');

    // Construct Stripe Checkout Session with verified server pricing
    const stripeParams = new URLSearchParams();
    stripeParams.append('mode', 'subscription');
    stripeParams.append('payment_method_types[0]', 'card');
    stripeParams.append('customer_email', appRecord.email || '');
    stripeParams.append('client_reference_id', cleanAppId);
    stripeParams.append('line_items[0][price_data][currency]', 'usd');
    stripeParams.append('line_items[0][price_data][recurring][interval]', 'month');
    stripeParams.append('line_items[0][price_data][unit_amount]', String(Math.round(verifiedMonthlyRate * 100)));
    stripeParams.append('line_items[0][price_data][product_data][name]', 'Sector Seven Cyber Protection');
    stripeParams.append(
      'line_items[0][price_data][product_data][description]',
      `Cloud & Endpoint MDR subscription for ${appRecord.company_name} (${deviceCount} devices, ${cloudUserCount} cloud users)`
    );
    stripeParams.append('line_items[0][quantity]', '1');
    stripeParams.append(
      'success_url',
      `${siteUrl}/dashboard?id=${encodeURIComponent(cleanAppId)}&session_id={CHECKOUT_SESSION_ID}`
    );
    stripeParams.append(
      'cancel_url',
      `${siteUrl}/activate?id=${encodeURIComponent(cleanAppId)}&canceled=true`
    );
    stripeParams.append('metadata[application_id]', cleanAppId);
    stripeParams.append('metadata[company_name]', appRecord.company_name || '');
    stripeParams.append('metadata[device_count]', String(deviceCount));
    stripeParams.append('metadata[cloud_user_count]', String(cloudUserCount));
    stripeParams.append('metadata[verified_monthly_price]', String(verifiedMonthlyRate));

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: stripeParams.toString(),
    });

    const session = await stripeRes.json();

    if (session.url) {
      return res.status(200).json({ url: session.url, sessionId: session.id });
    } else {
      console.error('Stripe API error response:', session.error || session);
      return res.status(500).json({ error: 'Failed to initiate secure checkout session.' });
    }
  } catch (err: any) {
    console.error('Checkout session creation exception:', err);
    return res.status(500).json({ error: 'Internal checkout processing error.' });
  }
}
