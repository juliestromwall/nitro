// Account names from the customer import often carry a trailing
// "- Contact Name". When that suffix matches the account's own contact fields
// it's import noise rather than part of the shop's name, so it renders muted —
// still there for matching against QuickBooks, but not competing with the name.

export default function AccountName({ account, contactName, className = '' }) {
  if (!account?.name) return null

  const contact = contactName || [account.firstName, account.lastName].filter(Boolean).join(' ')
  const suffix = contact ? ` - ${contact}` : ''

  if (suffix && account.name.toLowerCase().endsWith(suffix.toLowerCase())) {
    return (
      <span className={className}>
        {account.name.slice(0, -suffix.length)}
        <span className="opacity-50 font-normal">{suffix}</span>
      </span>
    )
  }
  return <span className={className}>{account.name}</span>
}
