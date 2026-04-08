const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { brandName, commissionData } = await req.json()

    if (!commissionData || !brandName) {
      return jsonResponse({ error: 'Missing brandName or commissionData' }, 400)
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `You are a commission analyst for a sales rep. Analyze this commission data for the brand "${brandName}" and write a concise, actionable summary.

Here is the commission data (JSON array of accounts with their commission status):
${JSON.stringify(commissionData)}

Each account has: accountName, orderCount, salesTotal, commissionDue, commissionPaid, commissionOwed, payStatus (paid/partial/unpaid/invoice sent/pending invoice/short shipped).

Write a brief, direct summary covering:
1. **Overview** — One sentence: total accounts, how much earned vs paid, what % of commissions have been collected
2. **Problem accounts** — Which accounts owe the most? Call them out by name with amounts. Be blunt.
3. **Getting caught up** — Any accounts with partial payments making progress?
4. **What to expect** — How much can the rep still expect to collect? Any accounts that look like they might be trouble?
5. **Action items** — 2-3 specific next steps (e.g. "Follow up with X about the $Y they owe")

Keep it conversational and direct — like a smart assistant briefing a sales rep. Use dollar amounts. No fluff. Under 250 words.`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return jsonResponse({ error: `Claude API error: ${response.status} ${errText}` }, 500)
    }

    const result = await response.json()
    const summary = result.content?.[0]?.text || 'Unable to generate summary.'

    return jsonResponse({ summary })
  } catch (err) {
    return jsonResponse({ error: err.message }, 500)
  }
})
