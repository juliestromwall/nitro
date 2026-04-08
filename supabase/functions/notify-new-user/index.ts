const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()

    // Database webhook sends: { type, table, record, schema, old_record }
    const record = payload.record
    if (!record) {
      return new Response(JSON.stringify({ error: 'No record in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const email = record.email || 'Unknown'
    const createdAt = record.created_at
      ? new Date(record.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })
      : 'Unknown'

    // Send email notification via SendGrid
    const sgResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SENDGRID_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: 'hello@repcommish.com' }] }],
        from: { email: 'hello@repcommish.com', name: 'REPCOMMISH' },
        subject: `New user registered: ${email}`,
        content: [{
          type: 'text/html',
          value: `
        <div style="font-family: -apple-system, sans-serif; max-width: 500px;">
          <h2 style="color: #005b5b; margin-bottom: 16px;">New User Registration</h2>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Registered:</strong> ${createdAt} ET</p>
          <hr style="margin-top: 24px; border: none; border-top: 1px solid #e4e4e7;" />
          <p style="font-size: 12px; color: #a1a1aa;">Sent automatically from REPCOMMISH</p>
        </div>
      `,
        }],
      }),
    })

    if (!sgResponse.ok) {
      const errText = await sgResponse.text()
      console.error('SendGrid error:', errText)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Notify new user error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
