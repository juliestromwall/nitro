import { useState, useRef } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { useBrandAdmin } from '@/context/BrandAdminContext'
import { fetchConnectedClients, fetchConnectedSeasons } from '@/lib/brandAdminDb'
import { supabase } from '@/lib/supabase'

function BrandAdminUpload() {
  const { connections, repUsers, repCompanies } = useBrandAdmin()
  const [selectedRepId, setSelectedRepId] = useState('')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectedSeasonId, setSelectedSeasonId] = useState('')
  const [clients, setClients] = useState([])
  const [seasons, setSeasons] = useState([])
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState([])
  const fileInputRef = useRef(null)

  // Get unique reps from connections
  const uniqueReps = [...new Set(connections.map((c) => c.rep_id))]

  // Get companies for selected rep (only connected ones)
  const connectedCompanyIds = connections
    .filter((c) => c.rep_id === selectedRepId)
    .map((c) => c.company_id)
  const availableCompanies = (repCompanies[selectedRepId] || [])
    .filter((c) => connectedCompanyIds.includes(c.id))

  async function handleRepChange(repId) {
    setSelectedRepId(repId)
    setSelectedCompanyId('')
    setSelectedClientId('')
    setSelectedSeasonId('')
    setClients([])
    setSeasons([])
  }

  async function handleCompanyChange(companyId) {
    setSelectedCompanyId(companyId)
    setSelectedClientId('')
    setSelectedSeasonId('')
    if (!companyId || !selectedRepId) return

    try {
      const [clientData, seasonData] = await Promise.all([
        fetchConnectedClients(selectedRepId),
        fetchConnectedSeasons(selectedRepId, parseInt(companyId)),
      ])
      setClients(clientData)
      setSeasons(seasonData.filter((s) => !s.archived))
    } catch (err) {
      console.error('Failed to load account/season data:', err)
    }
  }

  function handleFileSelect(e) {
    const selected = Array.from(e.target.files || [])
    setFiles((prev) => [...prev, ...selected])
  }

  function handleDrop(e) {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files)
    setFiles((prev) => [...prev, ...dropped])
  }

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleUpload() {
    if (!selectedRepId || !selectedCompanyId || !selectedClientId || !selectedSeasonId || files.length === 0) return

    setUploading(true)
    setResults([])

    const { data: { session } } = await supabase.auth.getSession()
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const uploadResults = []

    for (const file of files) {
      try {
        const formData = new FormData()
        formData.append('repId', selectedRepId)
        formData.append('companyId', selectedCompanyId)
        formData.append('clientId', selectedClientId)
        formData.append('seasonId', selectedSeasonId)
        formData.append('fileType', 'invoice')
        formData.append('file', file)

        const response = await fetch(`${supabaseUrl}/functions/v1/process-brand-upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: formData,
        })

        const data = await response.json()
        if (response.ok) {
          uploadResults.push({ fileName: file.name, success: true, status: data.status, orderId: data.orderId })
        } else {
          uploadResults.push({ fileName: file.name, success: false, error: data.error })
        }
      } catch (err) {
        uploadResults.push({ fileName: file.name, success: false, error: err.message })
      }
    }

    setResults(uploadResults)
    setFiles([])
    setUploading(false)
  }

  const canUpload = selectedRepId && selectedCompanyId && selectedClientId && selectedSeasonId && files.length > 0

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Upload Documents</h1>

      <Card>
        <CardHeader>
          <CardTitle>Select Destination</CardTitle>
          <CardDescription>Choose which rep, brand, account, and season to upload to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Rep select */}
          <div>
            <label className="block text-sm font-medium mb-1">Rep</label>
            <select
              value={selectedRepId}
              onChange={(e) => handleRepChange(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 outline-none"
            >
              <option value="">Select a rep...</option>
              {uniqueReps.map((repId) => (
                <option key={repId} value={repId}>
                  {repUsers[repId]?.name || repUsers[repId]?.email || repId}
                </option>
              ))}
            </select>
          </div>

          {/* Company select */}
          {selectedRepId && (
            <div>
              <label className="block text-sm font-medium mb-1">Brand</label>
              <select
                value={selectedCompanyId}
                onChange={(e) => handleCompanyChange(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 outline-none"
              >
                <option value="">Select a brand...</option>
                {availableCompanies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Account select */}
          {selectedCompanyId && (
            <div>
              <label className="block text-sm font-medium mb-1">Account</label>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 outline-none"
              >
                <option value="">Select an account...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Season select */}
          {selectedClientId && (
            <div>
              <label className="block text-sm font-medium mb-1">Season / Tracker</label>
              <select
                value={selectedSeasonId}
                onChange={(e) => setSelectedSeasonId(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 outline-none"
              >
                <option value="">Select a season...</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* File upload zone */}
      {selectedSeasonId && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Files</CardTitle>
            <CardDescription>Drop PDF files here or click to browse.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg p-8 text-center cursor-pointer hover:border-[#005b5b] transition-colors"
            >
              <Upload className="size-8 text-zinc-400 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Drop files here or click to browse</p>
              <p className="text-xs text-zinc-400 mt-1">PDF files only</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                    <FileText className="size-4 text-zinc-400 shrink-0" />
                    <span className="text-sm flex-1 truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removeFile(i)} className="text-zinc-400 hover:text-red-500">
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={handleUpload}
              disabled={!canUpload || uploading}
              className="bg-[#005b5b] hover:bg-[#007a7a] text-white w-full"
            >
              {uploading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                  Uploading...
                </span>
              ) : (
                `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                {r.success ? (
                  <CheckCircle className="size-4 text-green-500 shrink-0" />
                ) : (
                  <AlertCircle className="size-4 text-red-500 shrink-0" />
                )}
                <span className="text-sm flex-1">{r.fileName}</span>
                <span className="text-xs text-muted-foreground">
                  {r.success ? (r.status === 'matched' ? 'Matched to existing order' : 'Created new order') : r.error}
                </span>
              </div>
            ))}
            <div className="pt-2 text-sm text-muted-foreground">
              {results.filter((r) => r.success && r.status === 'matched').length} matched,{' '}
              {results.filter((r) => r.success && r.status === 'created').length} created,{' '}
              {results.filter((r) => !r.success).length} failed
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default BrandAdminUpload
