// Accounting CRM state — contacts, notes, and to-dos hung off Tony's master
// account list, plus a dashboard scratchpad.
//
// Persistence rides the same portal_data key/value store the rest of the
// Payments page uses (see portalStore.js), so every accounting login reads and
// writes the same rows without a schema migration. Each dataset is one blob:
//
//   crm_contacts    { [accountId]: Contact[] }
//   crm_notes       { [accountId]: Note[] }
//   crm_todos       Todo[]        — accountId may be null for general to-dos
//   crm_quick_notes QuickNote[]   — dashboard scratchpad, not account-scoped
//   crm_email_log   SentEmail[]   — what we've emailed, newest first
//   crm_rep_profiles { [repId]: RepProfile } — accounting's editable overrides
//                     (name / business / contact) on top of the portal rep list
//
// Rep notes reuse the notes blob under a namespaced key, `rep:<repId>`, so reps
// and accounts share one implementation rather than two near-identical ones.
//
// Writes are optimistic: local state updates immediately, the blob is pushed
// in the background. `saveError` surfaces a failed push so the UI can warn.

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { pgetMany, pset } from '@/lib/portalStore'
import { useAuth } from '@/context/AuthContext'

const KEYS = {
  contacts: 'crm_contacts',
  notes: 'crm_notes',
  todos: 'crm_todos',
  quickNotes: 'crm_quick_notes',
  emailLog: 'crm_email_log',
  repProfiles: 'crm_rep_profiles',
}

// The log is a rolling window, not an archive — Gmail is the archive. Keeps
// the blob from growing without bound.
const EMAIL_LOG_LIMIT = 500

const CrmContext = createContext(null)

// Ids only need to be unique within a blob, and these blobs are small.
let idCounter = 0
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`

const nowIso = () => new Date().toISOString()

export function CrmProvider({ children }) {
  const { user } = useAuth()
  const [contacts, setContacts] = useState({})
  const [notes, setNotes] = useState({})
  const [todos, setTodos] = useState([])
  const [quickNotes, setQuickNotes] = useState([])
  const [emailLog, setEmailLog] = useState([])
  const [repProfiles, setRepProfiles] = useState({})
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState(null)

  // Who gets stamped on new notes/to-dos.
  const author = user?.email || 'accounting'

  useEffect(() => {
    let cancelled = false
    pgetMany(Object.values(KEYS))
      .then((blobs) => {
        if (cancelled) return
        const c = blobs[KEYS.contacts]
        const n = blobs[KEYS.notes]
        const t = blobs[KEYS.todos]
        const q = blobs[KEYS.quickNotes]
        const e = blobs[KEYS.emailLog]
        const rp = blobs[KEYS.repProfiles]
        if (c && typeof c === 'object') setContacts(c)
        if (n && typeof n === 'object') setNotes(n)
        if (Array.isArray(t)) setTodos(t)
        if (Array.isArray(q)) setQuickNotes(q)
        if (Array.isArray(e)) setEmailLog(e)
        if (rp && typeof rp === 'object') setRepProfiles(rp)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Push a blob in the background. Reports the first failure and stays quiet
  // afterwards so a dead connection doesn't spam the UI.
  const push = useCallback((key, value) => {
    pset(key, value)
      .then(() => setSaveError((e) => (e?.key === key ? null : e)))
      .catch((err) => setSaveError({ key, message: err?.message || 'Save failed' }))
  }, [])

  // setState + persist, in one call. `updater` receives previous state.
  const commit = useCallback((key, setter, updater) => {
    setter((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      push(key, next)
      return next
    })
  }, [push])

  // ===== Contacts =====
  const getContacts = useCallback((accountId) => contacts[accountId] || [], [contacts])

  const addContact = useCallback((accountId, data) => {
    const contact = {
      id: newId('ct'),
      name: '', title: '', email: '', phone: '', notes: '',
      ...data,
      createdAt: nowIso(),
    }
    commit(KEYS.contacts, setContacts, (prev) => {
      const list = prev[accountId] || []
      // First contact on an account becomes primary by default.
      if (!list.length) contact.isPrimary = true
      return { ...prev, [accountId]: [...list, contact] }
    })
    return contact
  }, [commit])

  const updateContact = useCallback((accountId, contactId, patch) => {
    commit(KEYS.contacts, setContacts, (prev) => ({
      ...prev,
      [accountId]: (prev[accountId] || []).map((c) => (c.id === contactId ? { ...c, ...patch } : c)),
    }))
  }, [commit])

  const deleteContact = useCallback((accountId, contactId) => {
    commit(KEYS.contacts, setContacts, (prev) => ({
      ...prev,
      [accountId]: (prev[accountId] || []).filter((c) => c.id !== contactId),
    }))
  }, [commit])

  // Exactly one primary per account.
  const setPrimaryContact = useCallback((accountId, contactId) => {
    commit(KEYS.contacts, setContacts, (prev) => ({
      ...prev,
      [accountId]: (prev[accountId] || []).map((c) => ({ ...c, isPrimary: c.id === contactId })),
    }))
  }, [commit])

  // ===== Notes =====
  const getNotes = useCallback((accountId) => notes[accountId] || [], [notes])

  const addNote = useCallback((accountId, body) => {
    const text = String(body || '').trim()
    if (!text) return null
    const note = { id: newId('nt'), body: text, author, createdAt: nowIso() }
    commit(KEYS.notes, setNotes, (prev) => ({
      ...prev,
      [accountId]: [note, ...(prev[accountId] || [])],
    }))
    return note
  }, [commit, author])

  const updateNote = useCallback((accountId, noteId, body) => {
    const text = String(body || '').trim()
    if (!text) return
    commit(KEYS.notes, setNotes, (prev) => ({
      ...prev,
      [accountId]: (prev[accountId] || []).map((n) =>
        n.id === noteId ? { ...n, body: text, editedAt: nowIso() } : n
      ),
    }))
  }, [commit])

  const deleteNote = useCallback((accountId, noteId) => {
    commit(KEYS.notes, setNotes, (prev) => ({
      ...prev,
      [accountId]: (prev[accountId] || []).filter((n) => n.id !== noteId),
    }))
  }, [commit])

  // ===== To-dos =====
  // Flat list so the Dashboard can show every open item across accounts.
  const addTodo = useCallback((data) => {
    const todo = {
      id: newId('td'),
      title: '',
      accountId: null,
      accountName: null,
      due: null,            // YYYY-MM-DD
      priority: 'normal',   // 'high' | 'normal' | 'low'
      done: false,
      completedAt: null,
      ...data,
      author,
      createdAt: nowIso(),
    }
    if (!String(todo.title).trim()) return null
    commit(KEYS.todos, setTodos, (prev) => [todo, ...prev])
    return todo
  }, [commit, author])

  const updateTodo = useCallback((todoId, patch) => {
    commit(KEYS.todos, setTodos, (prev) => prev.map((t) => (t.id === todoId ? { ...t, ...patch } : t)))
  }, [commit])

  const toggleTodo = useCallback((todoId) => {
    commit(KEYS.todos, setTodos, (prev) => prev.map((t) => (
      t.id === todoId ? { ...t, done: !t.done, completedAt: !t.done ? nowIso() : null } : t
    )))
  }, [commit])

  const deleteTodo = useCallback((todoId) => {
    commit(KEYS.todos, setTodos, (prev) => prev.filter((t) => t.id !== todoId))
  }, [commit])

  const getTodos = useCallback((accountId) => todos.filter((t) => t.accountId === accountId), [todos])

  // ===== Quick notes (dashboard scratchpad) =====
  const addQuickNote = useCallback((body) => {
    const text = String(body || '').trim()
    if (!text) return null
    const note = { id: newId('qn'), body: text, author, createdAt: nowIso() }
    commit(KEYS.quickNotes, setQuickNotes, (prev) => [note, ...prev])
    return note
  }, [commit, author])

  const updateQuickNote = useCallback((noteId, body) => {
    const text = String(body || '').trim()
    if (!text) return
    commit(KEYS.quickNotes, setQuickNotes, (prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, body: text, editedAt: nowIso() } : n)))
  }, [commit])

  const deleteQuickNote = useCallback((noteId) => {
    commit(KEYS.quickNotes, setQuickNotes, (prev) => prev.filter((n) => n.id !== noteId))
  }, [commit])

  // ===== Sent email log =====
  // Recorded automatically after a successful send. accountId is optional —
  // emailing someone who isn't tied to an account is a first-class case.
  const logEmail = useCallback((entry) => {
    const record = {
      id: newId('em'),
      accountId: null,
      accountName: null,
      to: '',
      subject: '',
      messageId: null,
      ...entry,
      author,
      sentAt: nowIso(),
    }
    commit(KEYS.emailLog, setEmailLog, (prev) => [record, ...prev].slice(0, EMAIL_LOG_LIMIT))
    return record
  }, [commit, author])

  const getEmails = useCallback(
    (accountId) => emailLog.filter((e) => e.accountId === accountId),
    [emailLog]
  )

  // ===== Derived counts, for badges on the account list =====
  const countsByAccount = useMemo(() => {
    const out = {}
    const slot = (id) => {
      if (!out[id]) out[id] = { contacts: 0, notes: 0, openTodos: 0, emails: 0 }
      return out[id]
    }
    for (const [id, list] of Object.entries(contacts)) slot(id).contacts = list?.length || 0
    for (const [id, list] of Object.entries(notes)) slot(id).notes = list?.length || 0
    for (const t of todos) if (!t.done && t.accountId) slot(t.accountId).openTodos += 1
    for (const e of emailLog) if (e.accountId) slot(e.accountId).emails += 1
    return out
  }, [contacts, notes, todos, emailLog])

  // ===== Rep profiles =====
  // Accounting's editable overlay on the portal rep list. Only fields actually
  // edited are stored; everything else falls back to the underlying rep record,
  // so a blank override never wipes out real data.
  const getRepProfile = useCallback((repId) => repProfiles[repId] || {}, [repProfiles])

  const saveRepProfile = useCallback((repId, patch) => {
    commit(KEYS.repProfiles, setRepProfiles, (prev) => {
      const next = { ...(prev[repId] || {}) }
      for (const [k, v] of Object.entries(patch || {})) {
        const val = typeof v === 'string' ? v.trim() : v
        if (val === '' || val == null) delete next[k]   // cleared → fall back to the rep record
        else next[k] = val
      }
      return { ...prev, [repId]: next }
    })
  }, [commit])

  // Merge an override over a portal rep record.
  const repWithProfile = useCallback((rep) => {
    if (!rep) return rep
    return { ...rep, ...(repProfiles[rep.id] || {}) }
  }, [repProfiles])

  // Namespaced key so rep notes live in the same blob as account notes.
  const repNoteKey = (repId) => `rep:${repId}`

  const value = {
    loading, saveError,
    contacts, notes, todos, quickNotes, emailLog, countsByAccount,
    getContacts, addContact, updateContact, deleteContact, setPrimaryContact,
    getNotes, addNote, updateNote, deleteNote,
    getTodos, addTodo, updateTodo, toggleTodo, deleteTodo,
    addQuickNote, updateQuickNote, deleteQuickNote,
    logEmail, getEmails,
    repProfiles, getRepProfile, saveRepProfile, repWithProfile, repNoteKey,
  }

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>
}

export function useCrm() {
  const ctx = useContext(CrmContext)
  if (!ctx) throw new Error('useCrm must be used inside a CrmProvider')
  return ctx
}
