import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify caller via JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify user is a brand admin
    const { data: { user: fullUser } } = await supabase.auth.admin.getUserById(user.id)
    if (fullUser?.app_metadata?.role !== 'brand_admin') {
      return new Response(JSON.stringify({ error: 'Brand admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse multipart form data
    const formData = await req.formData()
    const repId = formData.get('repId') as string
    const companyId = formData.get('companyId') as string
    const clientId = formData.get('clientId') as string
    const seasonId = formData.get('seasonId') as string
    const fileType = (formData.get('fileType') as string) || 'invoice'
    const file = formData.get('file') as File

    if (!repId || !companyId || !clientId || !seasonId || !file) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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
      return new Response(JSON.stringify({ error: 'No active connection for this rep/company' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Upload file to rep's storage space using service_role
    const uploadId = crypto.randomUUID()
    const storagePath = `${repId}/brand-uploads/${uploadId}/${file.name}`

    const fileBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/pdf',
      })

    if (uploadError) {
      return new Response(JSON.stringify({ error: 'File upload failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look for existing orders for this account + company + season
    const { data: existingOrders } = await supabase
      .from('orders')
      .select('id, invoices')
      .eq('user_id', repId)
      .eq('client_id', parseInt(clientId))
      .eq('company_id', parseInt(companyId))
      .eq('season_id', seasonId)
      .limit(1)

    let matchedOrderId: number | null = null
    let resultStatus: string = 'created'

    const docEntry = { name: file.name, path: storagePath }

    if (existingOrders && existingOrders.length > 0) {
      // Match: attach document to existing order's invoices array
      const order = existingOrders[0]
      const invoices = Array.isArray(order.invoices) ? [...order.invoices, docEntry] : [docEntry]

      await supabase
        .from('orders')
        .update({ invoices })
        .eq('id', order.id)

      matchedOrderId = order.id
      resultStatus = 'matched'
    } else {
      // No match: create a new order in rep's data space
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: repId,
          client_id: parseInt(clientId),
          company_id: parseInt(companyId),
          season_id: seasonId,
          order_type: 'Rental',
          stage: 'Invoiced',
          total: 0,
          invoices: [docEntry],
          notes: `Uploaded by brand admin on ${new Date().toLocaleDateString()}`,
        })
        .select('id')
        .single()

      if (orderError) {
        return new Response(JSON.stringify({ error: 'Failed to create order' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      matchedOrderId = newOrder.id
      resultStatus = 'created'
    }

    // Record in brand_uploads table
    await supabase
      .from('brand_uploads')
      .insert({
        brand_admin_id: user.id,
        rep_id: repId,
        company_id: parseInt(companyId),
        client_id: parseInt(clientId),
        file_name: file.name,
        file_path: storagePath,
        file_type: fileType,
        matched_order_id: matchedOrderId,
        status: resultStatus,
      })

    return new Response(JSON.stringify({
      success: true,
      status: resultStatus,
      orderId: matchedOrderId,
      fileName: file.name,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
