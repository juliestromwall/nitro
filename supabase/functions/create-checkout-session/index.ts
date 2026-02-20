import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' })

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const PRICE_IDS: Record<string, string> = {
  monthly: Deno.env.get('STRIPE_PRICE_MONTHLY')!,
  annual: Deno.env.get('STRIPE_PRICE_ANNUAL')!,
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, email, plan, embedded } = await req.json()

    if (!email || !plan) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const priceId = PRICE_IDS[plan]
    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Invalid plan' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let customerId: string

    if (userId) {
      // Existing user flow — check for existing Stripe customer
      const { data: existingSub } = await supabase
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .single()

      if (existingSub?.stripe_customer_id) {
        try {
          await stripe.customers.retrieve(existingSub.stripe_customer_id)
          customerId = existingSub.stripe_customer_id
        } catch {
          const customer = await stripe.customers.create({ email, metadata: { user_id: userId } })
          customerId = customer.id
          await supabase.from('subscriptions').update({ stripe_customer_id: customerId }).eq('user_id', userId)
        }
      } else {
        const customer = await stripe.customers.create({ email, metadata: { user_id: userId } })
        customerId = customer.id
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: customerId,
          plan,
          status: 'incomplete',
        }, { onConflict: 'user_id' })
      }
    } else {
      // Guest checkout — no user account yet, just create Stripe customer
      const customer = await stripe.customers.create({ email })
      customerId = customer.id
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'https://repcommish.com'

    if (embedded) {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: { trial_period_days: 7 },
        saved_payment_method_options: { payment_method_save: 'disabled' },
        ui_mode: 'embedded',
        return_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        metadata: { user_id: userId || '', email },
      })

      return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: { trial_period_days: 7 },
        success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/checkout/cancel`,
        metadata: { user_id: userId || '', email },
      })

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
