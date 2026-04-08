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

async function getGoogleAccessToken(): Promise<string> {
  const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')!
  const privateKeyPem = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')!

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const headerB64 = enc(header)
  const payloadB64 = enc(payload)
  const signingInput = `${headerB64}.${payloadB64}`

  const pemBody = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  const keyBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  )

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const jwt = `${signingInput}.${sigB64}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    throw new Error(`Google token exchange failed: ${err}`)
  }

  const tokenData = await tokenRes.json()
  return tokenData.access_token
}

async function sheetsApi(token: string, spreadsheetId: string, path: string, body: unknown, method = 'POST') {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${path}`,
    {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  return res
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { spreadsheetId, sheetName, data, brandName, trackerLabel } = await req.json()

    if (!spreadsheetId || !data || !Array.isArray(data)) {
      return jsonResponse({ error: 'Missing spreadsheetId or data array' }, 400)
    }

    const token = await getGoogleAccessToken()
    const sheet = sheetName || 'Sheet1'
    const sid = 0 // sheetId for first sheet
    const D = 4 // data start row (after title, date, blank, col headers)
    const N = data.length

    // Identify account header rows vs sub-rows
    const accountRowIndices: number[] = []
    const subRowRanges: { start: number; end: number }[] = []
    let currentSubStart: number | null = null

    for (let i = 0; i < N; i++) {
      const isAccountRow = data[i][1] && !data[i][2] // has Account name, no Order #
      if (isAccountRow) {
        // Close previous sub-row range
        if (currentSubStart !== null) {
          subRowRanges.push({ start: currentSubStart, end: D + i })
          currentSubStart = null
        }
        accountRowIndices.push(D + i)
      } else {
        if (currentSubStart === null) currentSubStart = D + i
      }
    }
    // Close last sub-row range
    if (currentSubStart !== null) {
      subRowRanges.push({ start: currentSubStart, end: D + N })
    }

    // === Step 1: Clear sheet (data + formatting + grouping) ===
    const clearRequests: any[] = [
      // Remove all row groups (depth 1) if they exist
      { updateSheetProperties: { properties: { sheetId: sid, gridProperties: { frozenRowCount: 0 } }, fields: 'gridProperties.frozenRowCount' } },
    ]
    // Try deleting dimension groups — ignore errors
    await sheetsApi(token, spreadsheetId, ':batchUpdate', {
      requests: [{ deleteDimensionGroup: { range: { sheetId: sid, dimension: 'ROWS', startIndex: D, endIndex: D + 5000 } } }],
    }).catch(() => {})

    // Clear all values and formatting
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheet}!A1:Z10000:clear`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    )
    // Reset all formatting
    await sheetsApi(token, spreadsheetId, ':batchUpdate', {
      requests: [{
        repeatCell: {
          range: { sheetId: sid, startRowIndex: 0, endRowIndex: D + N + 10, startColumnIndex: 0, endColumnIndex: 10 },
          cell: { userEnteredFormat: {} },
          fields: 'userEnteredFormat',
        },
      }],
    })

    // === Step 2: Write data ===
    const rows: (string | number)[][] = [
      [`REPCOMMISH — ${brandName || 'Commissions'}${trackerLabel ? ` — ${trackerLabel}` : ''}`],
      [`Last synced: ${new Date().toLocaleString('en-US', { timeZone: 'America/Denver' })}`],
      [],
      ['Brand', 'Account', 'Order #', 'Order Total', 'Commission %', 'Commission Due', 'Commission Paid', 'Commission Owed', 'Status'],
      ...data,
    ]

    const writeRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheet}!A1?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ range: `${sheet}!A1`, majorDimension: 'ROWS', values: rows }),
      }
    )
    if (!writeRes.ok) {
      const err = await writeRes.text()
      return jsonResponse({ error: `Write failed: ${err}` }, 500)
    }

    // === Step 3: Apply formatting (single batch) ===
    const fmt: any[] = [
      // Title row bold
      { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 9 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } } }, fields: 'userEnteredFormat.textFormat' } },
      // Column header row: teal bg, white bold text
      { repeatCell: { range: { sheetId: sid, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 9 }, cell: { userEnteredFormat: { backgroundColor: { red: 0, green: 0.357, blue: 0.357 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 } } }, fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat' } },
      // Freeze top 4 rows
      { updateSheetProperties: { properties: { sheetId: sid, gridProperties: { frozenRowCount: 4 } }, fields: 'gridProperties.frozenRowCount' } },
      // Currency format: cols D(3), F(5), G(6), H(7)
      ...[3, 5, 6, 7].map((c) => ({
        repeatCell: { range: { sheetId: sid, startRowIndex: D, endRowIndex: D + N, startColumnIndex: c, endColumnIndex: c + 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '$#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' },
      })),
      // Percent format: col E(4)
      { repeatCell: { range: { sheetId: sid, startRowIndex: D, endRowIndex: D + N, startColumnIndex: 4, endColumnIndex: 5 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0"%"' } } }, fields: 'userEnteredFormat.numberFormat' } },
      // Auto-resize columns
      { autoResizeDimensions: { dimensions: { sheetId: sid, dimension: 'COLUMNS', startIndex: 0, endIndex: 9 } } },
    ]

    // Account header rows: bold + teal background (one request per account row)
    for (const r of accountRowIndices) {
      fmt.push({
        repeatCell: {
          range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 9 },
          cell: { userEnteredFormat: { backgroundColor: { red: 0.902, green: 0.941, blue: 0.941 }, textFormat: { bold: true, fontSize: 10 } } },
          fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat',
        },
      })
    }

    // Sub-row visible columns (C-F): gray text — use contiguous ranges for efficiency
    for (const range of subRowRanges) {
      fmt.push({
        repeatCell: {
          range: { sheetId: sid, startRowIndex: range.start, endRowIndex: range.end, startColumnIndex: 2, endColumnIndex: 6 },
          cell: { userEnteredFormat: { textFormat: { fontSize: 9, foregroundColor: { red: 0.33, green: 0.33, blue: 0.33 } } } },
          fields: 'userEnteredFormat.textFormat',
        },
      })
    }

    await sheetsApi(token, spreadsheetId, ':batchUpdate', { requests: fmt })

    // === Step 4: Hide sub-row columns (separate batch so it runs after number formatting) ===
    // Cols A(0)-B(1) and G(6)-I(8): white text on sub-rows
    const hideRequests: any[] = []
    for (const range of subRowRanges) {
      for (const [sc, ec] of [[0, 2], [6, 9]]) {
        hideRequests.push({
          repeatCell: {
            range: { sheetId: sid, startRowIndex: range.start, endRowIndex: range.end, startColumnIndex: sc, endColumnIndex: ec },
            cell: { userEnteredFormat: { textFormat: { fontSize: 9, foregroundColor: { red: 1, green: 1, blue: 1 } } } },
            fields: 'userEnteredFormat.textFormat',
          },
        })
      }
    }
    if (hideRequests.length > 0) {
      await sheetsApi(token, spreadsheetId, ':batchUpdate', { requests: hideRequests })
    }

    // === Step 5: Row grouping (collapsible accounts) ===
    const groupRequests: any[] = []
    for (const range of subRowRanges) {
      if (range.end > range.start) {
        groupRequests.push({
          addDimensionGroup: {
            range: { sheetId: sid, dimension: 'ROWS', startIndex: range.start, endIndex: range.end },
          },
        })
      }
    }
    if (groupRequests.length > 0) {
      await sheetsApi(token, spreadsheetId, ':batchUpdate', { requests: groupRequests })
    }

    return jsonResponse({
      success: true,
      updatedRows: rows.length,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    })
  } catch (err) {
    return jsonResponse({ error: err.message }, 500)
  }
})
