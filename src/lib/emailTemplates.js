// Canned messages for the emails accounting actually sends, with merge fields
// filled from the account you're composing from.
//
// Merge fields — anything unknown resolves to an empty string rather than
// leaving a raw {{token}} in the message:
//   {{contact_first}}  first name of the first recipient
//   {{account}}        account / shop name
//   {{open_balance}}   formatted open balance, e.g. $1,240.00
//   {{invoice_list}}   one open invoice per line (number · date · amount)
//   {{oldest_due}}     due date of the oldest open invoice
//   {{my_name}}        sender's display name

export const EMAIL_TEMPLATES = [
  {
    id: 'blank',
    label: 'Blank',
    subject: '',
    body: '',
  },
  {
    id: 'past-due',
    label: 'Past-due reminder',
    subject: 'Past-due balance — {{account}}',
    body: `Hi {{contact_first}},

Hope the season's treating you well. Our records show an outstanding balance of {{open_balance}} on the account, with the oldest invoice due {{oldest_due}}:

{{invoice_list}}

If any of these have already been paid, send over the remittance details and I'll get them cleared on our end. Otherwise, let me know when we can expect payment.

Thanks,
{{my_name}}`,
  },
  {
    id: 'statement',
    label: 'Statement / open balance',
    subject: 'Account statement — {{account}}',
    body: `Hi {{contact_first}},

Here's where {{account}} currently stands with us. Open balance is {{open_balance}} across the following invoices:

{{invoice_list}}

Let me know if you'd like copies of any of these, or if anything looks off.

Thanks,
{{my_name}}`,
  },
  {
    id: 'payment-received',
    label: 'Payment received',
    subject: 'Payment received — thank you',
    body: `Hi {{contact_first}},

Just confirming we received your payment — thank you, it's been applied to the account.

Appreciate you,
{{my_name}}`,
  },
  {
    id: 'invoice-question',
    label: 'Question on an invoice',
    subject: 'Quick question — {{account}}',
    body: `Hi {{contact_first}},

Following up on the account. Could you help me confirm a couple of details on the invoices below?

{{invoice_list}}

Thanks,
{{my_name}}`,
  },
  {
    id: 'intro',
    label: 'Intro / check-in',
    subject: 'Checking in — Foundry Distribution',
    body: `Hi {{contact_first}},

{{my_name}} here from Foundry Distribution accounting. Reaching out so you have a direct contact for anything billing-related — invoices, statements, remittance questions.

Anything you need, just reply here.

Thanks,
{{my_name}}`,
  },
]

const money = (n) => {
  const num = Number(n || 0)
  const abs = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return num < 0 ? `-$${abs}` : `$${abs}`
}

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

// A real contact name is always preferred. Falling back to an email address is
// only safe when the local part is clearly "first.last" — guessing from
// "tcshanerj@yahoo.com" produces "Hi Tcshanerj," which is worse than "Hi there".
const firstNameOf = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return 'there'

  if (!raw.includes('@')) {
    const first = raw.split(/\s+/)[0]
    return first ? titleCase(first) : 'there'
  }

  const local = raw.split('@')[0]
  if (!/[._-]/.test(local)) return 'there'
  const first = local.split(/[._-]+/)[0]
  return first && /^[a-z]+$/i.test(first) && first.length > 1 ? titleCase(first) : 'there'
}

/**
 * Build the merge values for an account.
 * `invoices` are the account's invoices; only open/partial ones are listed.
 */
export function templateContext({ account, invoices = [], openBalance = 0, senderName = '' } = {}) {
  const open = invoices.filter((inv) => (inv.openBalance || 0) > 0.005)

  const invoiceList = open.length
    ? open
        .slice(0, 25)
        .map((inv) => `  • ${inv.num || 'Invoice'} · ${inv.date || 'no date'} · ${money(inv.openBalance)}`)
        .join('\n')
    : '  • (no open invoices on file)'

  // Dates arrive as mm/dd/yyyy; compare on a sortable form.
  const iso = (s) => {
    const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
    if (!m) return ''
    const [, mm, dd, yyyy] = m
    return `${yyyy.length === 2 ? `20${yyyy}` : yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  const oldest = open
    .filter((inv) => inv.dueDate)
    .sort((a, b) => iso(a.dueDate).localeCompare(iso(b.dueDate)))[0]

  return {
    account: account?.name || '',
    open_balance: money(openBalance),
    invoice_list: invoiceList,
    oldest_due: oldest?.dueDate || 'on file',
    my_name: senderName || '',
  }
}

/** Replace {{tokens}}; unknown tokens become ''. */
export function renderTemplate(text, vars = {}) {
  return String(text || '').replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key]
    return v === undefined || v === null ? '' : String(v)
  })
}

/** Apply a template, resolving {{contact_first}} from the chosen recipients. */
export function applyTemplate(template, vars, recipients = []) {
  const merged = { ...vars, contact_first: firstNameOf(vars.contact_first || recipients[0]) }
  return {
    subject: renderTemplate(template.subject, merged),
    body: renderTemplate(template.body, merged),
  }
}
