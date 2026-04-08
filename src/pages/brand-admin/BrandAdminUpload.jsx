import { useState, useRef } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, AlertTriangle, X, Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { useBrandAdmin } from '@/context/BrandAdminContext'
import { supabase } from '@/lib/supabase'
import JSZip from 'jszip'

function BrandAdminUpload() {
  const { connections, repUsers, repCompanies } = useBrandAdmin()
  const [selectedRepId, setSelectedRepId] = useState('')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
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

  function handleRepChange(repId) {
    setSelectedRepId(repId)
    // Auto-select company if only one connected
    const companyIds = connections.filter((c) => c.rep_id === repId).map((c) => c.company_id)
    const companies = (repCompanies[repId] || []).filter((c) => companyIds.includes(c.id))
    setSelectedCompanyId(companies.length === 1 ? String(companies[0].id) : '')
  }

  const [extracting, setExtracting] = useState(false)

  async function extractPdfsFromZip(zipFile) {
    const zip = await JSZip.loadAsync(zipFile)
    const pdfs = []
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue
      if (!path.toLowerCase().endsWith('.pdf')) continue
      // Skip macOS resource fork files
      if (path.startsWith('__MACOSX/') || path.includes('/._')) continue
      const blob = await entry.async('blob')
      const name = path.split('/').pop()
      pdfs.push(new File([blob], name, { type: 'application/pdf' }))
    }
    return pdfs
  }

  async function addFiles(rawFiles) {
    const pdfFiles = []
    const zipFiles = []
    for (const f of rawFiles) {
      if (f.name.toLowerCase().endsWith('.zip')) zipFiles.push(f)
      else if (f.name.toLowerCase().endsWith('.pdf')) pdfFiles.push(f)
    }
    if (zipFiles.length > 0) {
      setExtracting(true)
      try {
        for (const zf of zipFiles) {
          const extracted = await extractPdfsFromZip(zf)
          pdfFiles.push(...extracted)
        }
      } catch (err) {
        console.error('Zip extraction failed:', err)
      } finally {
        setExtracting(false)
      }
    }
    if (pdfFiles.length > 0) setFiles((prev) => [...prev, ...pdfFiles])
  }

  function handleFileSelect(e) {
    const selected = Array.from(e.target.files || [])
    addFiles(selected)
  }

  function handleDrop(e) {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files)
    addFiles(dropped)
  }

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleUpload() {
    if (!selectedRepId || !selectedCompanyId || files.length === 0) return

    setUploading(true)
    setResults([])

    const uploadResults = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setUploadProgress(`Processing ${i + 1} of ${files.length}: ${file.name}`)

      try {
        const formData = new FormData()
        formData.append('repId', selectedRepId)
        formData.append('companyId', selectedCompanyId)
        formData.append('fileType', 'invoice')
        formData.append('file', file)

        const { data: result, error: fnError } = await supabase.functions.invoke('process-brand-upload', {
          body: formData,
        })

        console.log('Response:', result, fnError)

        if (fnError) throw fnError
        if (result?.success) {
          uploadResults.push({
            fileName: file.name,
            success: true,
            status: result.status,
            orderId: result.orderId,
            extracted: result.extracted,
            matchedAccount: result.matchedAccount,
            season: result.season,
          })
        } else {
          const errMsg = result?.error || result?.message || 'Unknown error'
          console.error('Upload error:', file.name, errMsg, result)
          uploadResults.push({ fileName: file.name, success: false, error: errMsg })
        }
      } catch (err) {
        console.error('Upload exception:', file.name, err)
        uploadResults.push({ fileName: file.name, success: false, error: err.message })
      }
    }

    setResults(uploadResults)
    setFiles([])
    setUploading(false)
    setUploadProgress('')
  }

  const canUpload = selectedRepId && selectedCompanyId && files.length > 0

  function getStatusIcon(r) {
    if (!r.success) return <AlertCircle className="size-4 text-red-500 shrink-0" />
    if (r.status === 'unmatched') return <AlertTriangle className="size-4 text-amber-500 shrink-0" />
    return <CheckCircle className="size-4 text-blue-500 shrink-0" />
  }

  function getStatusText(r) {
    if (!r.success) return r.error
    if (r.status === 'pending') return 'Sent to rep for review'
    if (r.status === 'unmatched') return 'Sent to rep — no matching account found'
    return r.status
  }

  function getStatusBg(r) {
    if (!r.success) return 'bg-red-50 dark:bg-red-900/10'
    if (r.status === 'unmatched') return 'bg-amber-50 dark:bg-amber-900/10'
    return 'bg-zinc-50 dark:bg-zinc-800/50'
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Upload Documents</h1>

      <Card>
        <CardHeader>
          <CardTitle>Select Destination</CardTitle>
          <CardDescription>Choose a rep. AI will auto-match accounts from the PDF.</CardDescription>
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

          {/* Company select — only show if multiple brands for this rep */}
          {selectedRepId && availableCompanies.length > 1 && (
            <div>
              <label className="block text-sm font-medium mb-1">Brand</label>
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:border-[#005b5b] focus:ring-2 focus:ring-[#005b5b]/20 outline-none"
              >
                <option value="">Select a brand...</option>
                {availableCompanies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* File upload zone — shows right after brand is selected */}
      {selectedCompanyId && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Files</CardTitle>
            <CardDescription>Drop PDF invoices or a .zip of PDFs. AI will read each PDF and auto-match to the rep's accounts.</CardDescription>
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
              <p className="text-xs text-zinc-400 mt-1">PDF or ZIP files</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.zip"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Extracting indicator */}
            {extracting && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-zinc-300 border-t-[#005b5b]" />
                Extracting PDFs from zip...
              </div>
            )}

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
                  {uploadProgress || 'Processing...'}
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
          <CardContent className="space-y-3">
            {results.map((r, i) => (
              <div key={i} className={`p-3 rounded-lg ${getStatusBg(r)}`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{getStatusIcon(r)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.fileName}</p>
                    <p className="text-xs text-muted-foreground">{getStatusText(r)}</p>
                  </div>
                </div>
                {/* Show extracted details for successful uploads */}
                {r.success && r.extracted && (
                  <div className="ml-7 mt-2 text-xs text-muted-foreground space-y-0.5">
                    {r.extracted.accountName && (
                      <div>
                        <span className="font-medium">Account:</span> {r.extracted.accountName}
                        {r.matchedAccount && (
                          <span className="text-green-600 dark:text-green-400"> → {r.matchedAccount.name}</span>
                        )}
                      </div>
                    )}
                    {r.extracted.invoiceNumber && (
                      <div><span className="font-medium">Invoice #:</span> {r.extracted.invoiceNumber}</div>
                    )}
                    {r.extracted.amount && (
                      <div><span className="font-medium">Amount:</span> ${Number(r.extracted.amount).toLocaleString()}</div>
                    )}
                    {r.season && (
                      <div><span className="font-medium">Season:</span> {r.season.label}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div className="pt-2 text-sm text-muted-foreground">
              {results.filter((r) => r.success && r.status === 'pending').length} sent for review,{' '}
              {results.filter((r) => r.success && r.status === 'unmatched').length} unmatched,{' '}
              {results.filter((r) => !r.success).length} failed
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default BrandAdminUpload
