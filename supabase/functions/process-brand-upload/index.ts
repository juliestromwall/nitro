import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
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

// Fuzzy match: case-insensitive substring match, returns best match
function fuzzyMatchAccount(extractedName: string, accounts: { id: number; name: string }[]) {
  if (!extractedName) return null
  const needle = extractedName.toLowerCase().trim()

  // Exact match first
  const exact = accounts.find((a) => a.name.toLowerCase().trim() === needle)
  if (exact) return exact

  // Substring match — prefer shorter names that are contained in extracted name
  const substringMatches = accounts.filter(
    (a) =>
      needle.includes(a.name.toLowerCase().trim()) ||
      a.name.toLowerCase().trim().includes(needle)
  )

  if (substringMatches.length === 1) return substringMatches[0]

  // If multiple substring matches, prefer the closest length
  if (substringMatches.length > 1) {
    substringMatches.sort(
      (a, b) =>
        Math.abs(a.name.length - extractedName.length) -
        Math.abs(b.name.length - extractedName.length)
    )
    return substringMatches[0]
  }

  return null
}

async function extractPdfData(fileBase64: string, fileName: string) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: fileBase64,
              },
            },
            {
              type: 'text',
              text: `Extract from this invoice/order document:
1. Ship-to or Bill-to account/shop/store name (the customer, NOT the brand/vendor)
2. Invoice or order number
3. Total amount (as a number, no currency symbols)
4. Date (as YYYY-MM-DD if possible)

Return ONLY valid JSON with these exact keys:
{"account_name": "...", "invoice_number": "...", "amount": 0, "date": "..."}

If a field is not found, use null for that field.`,
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Claude API error: ${response.status} ${errText}`)
  }

  const result = await response.json()
  const text = result.content?.[0]?.text || '{}'

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { account_name: null, invoice_number: null, amount: null, date: null }

  try {
    return JSON.parse(jsonMatch[0])
  } catch {
    return { account_name: null, invoice_number: null, amount: null, date: null }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify caller via JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return jsonResponse({ error: 'Invalid token' }, 401)
    }

    // Verify user is a brand admin
    const { data: { user: fullUser } } = await supabase.auth.admin.getUserById(user.id)
    if (fullUser?.app_metadata?.role !== 'brand_admin') {
      return jsonResponse({ error: 'Brand admin access required' }, 403)
    }

    // Parse multipart form data — only repId, companyId, file required
    const formData = await req.formData()
    const repId = formData.get('repId') as string
    const companyId = formData.get('companyId') as string
    const fileType = (formData.get('fileType') as string) || 'invoice'
    const file = formData.get('file') as File

    if (!repId || !companyId || !file) {
      return jsonResponse({ error: 'Missing required fields (repId, companyId, file)' }, 400)
    }

    // Verify active connection with sharing enabled
    const { data: connection, error: connError } = await supabase
      .from('brand_connections')
      .select('id')
      .eq('brand_admin_id', user.id)
      .eq('rep_id', repId)
      .eq('company_id', parseInt(companyId))
      .eq('status', 'active')
      .eq('sharing_enabled', true)
      .single()

    if (connError || !connection) {
      return jsonResponse({ error: 'No active connection for this rep/company' }, 403)
    }

    // Upload file to rep's storage space
    const uploadId = crypto.randomUUID()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${repId}/brand-uploads/${uploadId}/${safeName}`

    const fileBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/pdf',
      })

    if (uploadError) {
      return jsonResponse({ error: `File upload failed: ${uploadError.message}` }, 500)
    }

    // Convert PDF to base64 for Claude using Deno's standard library
    const uint8Array = new Uint8Array(fileBuffer)
    // Use chunked approach to avoid stack overflow with large files
    const CHUNK_SIZE = 8192
    const chunks: string[] = []
    for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
      const chunk = uint8Array.subarray(i, i + CHUNK_SIZE)
      chunks.push(String.fromCharCode(...chunk))
    }
    const fileBase64 = btoa(chunks.join(''))

    // Extract data from PDF using Claude
    let extracted = { account_name: null, invoice_number: null, amount: null, date: null }
    let extractionError: string | null = null
    try {
      extracted = await extractPdfData(fileBase64, file.name)
    } catch (err) {
      console.error('PDF extraction failed:', err.message)
      extractionError = err.message
      // Continue with unmatched flow
    }

    // Fetch rep's accounts for matching
    const { data: repAccounts } = await supabase
      .from('clients')
      .select('id, name')
      .eq('user_id', repId)

    // Fuzzy match extracted account name
    const matchedAccount = fuzzyMatchAccount(extracted.account_name, repAccounts || [])

    // Pick most recent non-archived season for this company
    const { data: defaultSeasons } = await supabase
      .from('seasons')
      .select('id, label')
      .eq('user_id', repId)
      .eq('company_id', parseInt(companyId))
      .eq('archived', false)
      .order('created_at', { ascending: false })
      .limit(1)

    const defaultSeason = defaultSeasons?.[0] || null

    // Build potential matches — recent orders for matched account + company
    let potentialMatches: { id: number; order_number: string | null; total: number; stage: string; season_id: string }[] = []
    if (matchedAccount) {
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('id, order_number, total, stage, season_id')
        .eq('user_id', repId)
        .eq('client_id', matchedAccount.id)
        .eq('company_id', parseInt(companyId))
        .order('created_at', { ascending: false })
        .limit(10)

      potentialMatches = recentOrders || []
    }

    const resultStatus = matchedAccount ? 'pending' : 'unmatched'

    // Record in brand_uploads table — no order creation, rep reviews later
    await supabase
      .from('brand_uploads')
      .insert({
        brand_admin_id: user.id,
        rep_id: repId,
        company_id: parseInt(companyId),
        client_id: matchedAccount?.id || null,
        file_name: file.name,
        file_path: storagePath,
        file_type: fileType,
        matched_order_id: null,
        status: resultStatus,
        metadata: {
          extracted,
          matched_account_name: matchedAccount?.name || null,
          season_id: defaultSeason?.id || null,
          season_label: defaultSeason?.label || null,
          potential_matches: potentialMatches,
        },
      })

    return jsonResponse({
      success: true,
      status: resultStatus,
      fileName: file.name,
      extracted: {
        accountName: extracted.account_name,
        invoiceNumber: extracted.invoice_number,
        amount: extracted.amount,
        date: extracted.date,
      },
      matchedAccount: matchedAccount ? { id: matchedAccount.id, name: matchedAccount.name } : null,
      season: defaultSeason ? { id: defaultSeason.id, label: defaultSeason.label } : null,
      extractionError,
    })
  } catch (err) {
    return jsonResponse({ error: err.message }, 500)
  }
})
