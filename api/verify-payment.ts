import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://lmexwjocppravvmtwvzc.supabase.co';

const supabaseServiceRole =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  '';

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const originHost = new URL(origin).hostname.toLowerCase();
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
  const origin = req.headers.origin as string | undefined;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Security: Enforce POST only to eliminate state mutations via GET requests/crawlers (CWE-652)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Payment verification requires POST.' });
  }

  const { sessionId, id, applicationId } = req.body || {};
  const cleanSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
  const cleanAppId = typeof (id || applicationId) === 'string' ? (id || applicationId).trim() : '';

  if (!cleanSessionId) {
    return res.status(400).json({ error: 'Missing required sessionId parameter.' });
  }

  // Security: Reject simulation IDs in production verification
  if (cleanSessionId.startsWith('sim_') || cleanSessionId.startsWith('local_sim_') || cleanSessionId === 'demo_session') {
    return res.status(400).json({ error: 'Simulation session tokens are not accepted.' });
  }

  const stripeKey = (
    process.env.STRIPE_SECRET_KEY ||
    process.env.STRIPESANDBOX_SECRET_KEY ||
    process.env.VITE_STRIPE_SECRET_KEY ||
    ''
  ).trim();

  if (!stripeKey) {
    console.error('Stripe Secret Key not configured in server environment.');
    return res.status(500).json({ 
      error: 'Payment gateway configuration error. STRIPE_SECRET_KEY is not configured in Vercel project environment variables.' 
    });
  }

  if (!supabaseServiceRole) {
    console.error('SUPABASE_SERVICE_ROLE_KEY not configured on server.');
    return res.status(500).json({ 
      error: 'Internal configuration error. SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel project environment variables.' 
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole);

  try {
    // 1. Verify directly against official Stripe API
    const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(cleanSessionId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
      },
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok || session.error) {
      console.error('Stripe session retrieval error:', session.error);
      return res.status(400).json({
        error: 'Unable to verify payment with Stripe.',
        verified: false,
      });
    }

    const isPaid = session.payment_status === 'paid' || session.status === 'complete';
    const targetAppId = cleanAppId || session.client_reference_id || session.metadata?.application_id;

    if (!isPaid) {
      return res.status(400).json({
        verified: false,
        status: session.payment_status || 'unpaid',
        message: 'Payment has not been completed.',
      });
    }

    if (!targetAppId) {
      return res.status(400).json({
        error: 'Could not associate verified session with an application ID.',
        verified: false,
      });
    }

    const now = new Date().toISOString();
    const subscriptionId = session.subscription || null;
    const customerId = session.customer || null;
    const amountTotal = (session.amount_total || 0) / 100;

    // 2. Atomically update application record to PAID & ONBOARDING
    await supabaseAdmin
      .from('applications')
      .update({
        status: 'PAID',
        onboarding_status: 'IN_PROGRESS',
        stripe_session_id: session.id,
        stripe_subscription_id: subscriptionId,
        paid_at: now,
        updated_at: now,
      })
      .eq('id', targetAppId);

    // 3. Record audit log
    try {
      await supabaseAdmin.from('audit_logs').insert([
        {
          event_type: 'PAYMENT_COMPLETED',
          actor: 'STRIPE_API',
          application_id: targetAppId,
          title: 'Subscription Activated (Verified)',
          detail: `Payment verified via Stripe API. Session ID: ${session.id}`,
          metadata: {
            stripe_session_id: session.id,
            subscription_id: subscriptionId,
            customer_id: customerId,
            amount_total: amountTotal,
          },
        },
      ]);
    } catch (auditErr) {
      console.warn('Audit log write notice:', auditErr);
    }

    // 4. Update subscriptions table if subscription ID exists
    if (subscriptionId) {
      try {
        await supabaseAdmin.from('subscriptions').upsert([
          {
            id: subscriptionId,
            application_id: targetAppId,
            stripe_customer_id: customerId || 'cust_stripe',
            status: 'active',
            monthly_amount: amountTotal,
            protected_device_count: Number(session.metadata?.device_count || 1),
            protected_cloud_user_count: Number(session.metadata?.cloud_user_count || 0),
            updated_at: now,
          },
        ]);
      } catch (subErr) {
        console.warn('Subscription upsert notice:', subErr);
      }
    }

    // 5. Fetch updated application to return to onboarding dashboard
    const { data: updatedApp } = await supabaseAdmin
      .from('applications')
      .select('*')
      .eq('id', targetAppId)
      .maybeSingle();

    return res.status(200).json({
      verified: true,
      status: 'PAID',
      applicationId: targetAppId,
      sessionId: session.id,
      subscriptionId: subscriptionId,
      customerEmail: session.customer_details?.email || session.customer_email,
      application: updatedApp,
    });
  } catch (stripeErr: any) {
    console.error('Instant payment verification exception:', stripeErr);
    return res.status(500).json({ error: 'Internal payment verification error.' });
  }
}
