import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' })

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, sessionId, firstName, email } = await req.json()

    if (!userId || !sessionId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const customerId = session.customer as string
    const subscriptionId = session.subscription as string

    if (!subscriptionId) {
      return new Response(JSON.stringify({ error: 'No subscription found in session' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get subscription details from Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Create subscription row linking user to Stripe
    await supabase.from('subscriptions').upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      status: subscription.status,
      plan: subscription.items.data[0]?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly',
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    // Update Stripe customer metadata with user_id
    await stripe.customers.update(customerId, {
      metadata: { user_id: userId },
    })

    // Send welcome email (non-blocking)
    if (email) {
      try {
        const displayName = firstName || 'there'

        const sgResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SENDGRID_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email }] }],
            from: { email: 'hello@repcommish.com', name: 'REPCOMMISH' },
            subject: 'Welcome to RepCommish!',
            content: [{
              type: 'text/html',
              value: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr><td style="background-color:#005b5b;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">REPCOMMISH</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;font-weight:600;">Welcome, ${displayName}!</h2>
          <p style="margin:0 0 20px;color:#52525b;font-size:15px;line-height:1.6;">
            Your account is set up and ready to go. Here's what you can do with RepCommish:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="padding:8px 0;color:#52525b;font-size:14px;line-height:1.5;">
              <strong style="color:#005b5b;">Track Sales</strong> — Log orders and monitor performance across seasons
            </td></tr>
            <tr><td style="padding:8px 0;color:#52525b;font-size:14px;line-height:1.5;">
              <strong style="color:#005b5b;">Manage Commissions</strong> — Calculate and track commissions automatically
            </td></tr>
            <tr><td style="padding:8px 0;color:#52525b;font-size:14px;line-height:1.5;">
              <strong style="color:#005b5b;">Organize Accounts</strong> — Keep your accounts, contacts, and notes in one place
            </td></tr>
          </table>
          <p style="margin:0 0 28px;color:#52525b;font-size:14px;line-height:1.6;">
            Your <strong>7-day free trial</strong> has started — explore everything RepCommish has to offer.
          </p>
          <!-- CTA Button -->
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr><td style="background-color:#005b5b;border-radius:8px;">
              <a href="https://repcommish.com/app" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                Go to Dashboard
              </a>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 40px;border-top:1px solid #e4e4e7;text-align:center;">
          <p style="margin:0;color:#a1a1aa;font-size:12px;">
            RepCommish — Sales &amp; Commission Tracking for Independent Reps
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
            }],
          }),
        })

        if (!sgResponse.ok) {
          const errText = await sgResponse.text()
          console.error('SendGrid welcome email error:', errText)
        }
      } catch (emailErr) {
        console.error('Welcome email failed (non-blocking):', emailErr)
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
