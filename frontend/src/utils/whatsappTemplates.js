const SUPPORTED_PLACEHOLDERS = [
  'student_name',
  'candidate_name',
  'course_name',
  'branch_name',
  'phone_number',
  'total_fee',
  'paid_amount',
  'pending_amount',
  'installment_number',
  'installment_amount',
  'due_date',
  'next_payment_date',
  'follow_up_date',
  'rules_link',
  'institute_name',
]

export function formatWhatsAppCurrency(value) {
  if (value === null || value === undefined || value === '') return ''
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

export function formatWhatsAppDate(value) {
  if (!value) return ''
  const date = new Date(String(value).includes('T') ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function firstValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key]
    if (value !== null && value !== undefined && value !== '') return value
  }
  return ''
}

export function whatsappPlaceholderValues(row = {}) {
  const totalFee = firstValue(row, ['total_fee', 'total_fees', 'final_fees', 'actual_fees'])
  const paidAmount = firstValue(row, ['paid_amount', 'paid'])
  const pendingAmount = firstValue(row, ['pending_amount', 'balance'])
  const installmentAmount = firstValue(row, ['installment_amount', 'amount'])
  const dueDate = firstValue(row, ['due_date', 'next_payment_date'])

  return {
    student_name: firstValue(row, ['student_name', 'studentName', 'name', 'candidate_name']),
    candidate_name: firstValue(row, ['candidate_name', 'candidateName', 'student_name', 'name']),
    course_name: firstValue(row, ['course_name', 'course', 'course_enrolled']),
    branch_name: firstValue(row, ['branch_name', 'branch']),
    phone_number: firstValue(row, ['phone_number', 'phone', 'student_phone']),
    total_fee: formatWhatsAppCurrency(totalFee),
    paid_amount: formatWhatsAppCurrency(paidAmount),
    pending_amount: formatWhatsAppCurrency(pendingAmount),
    installment_number: firstValue(row, ['installment_number', 'installment_label', 'label']),
    installment_amount: formatWhatsAppCurrency(installmentAmount),
    due_date: formatWhatsAppDate(dueDate),
    next_payment_date: formatWhatsAppDate(firstValue(row, ['next_payment_date'])),
    follow_up_date: formatWhatsAppDate(firstValue(row, ['follow_up_date', 'next_follow_up_date'])),
    rules_link: firstValue(row, ['rules_link', 'signing_link']),
    institute_name: firstValue(row, ['institute_name']) || 'IIE',
  }
}

export function renderWhatsAppTemplate(templateOrBody, row = {}, fallbackBody = '') {
  const body = typeof templateOrBody === 'string' ? templateOrBody : templateOrBody?.message_body
  const values = whatsappPlaceholderValues(row)
  let message = body || fallbackBody || ''

  SUPPORTED_PLACEHOLDERS.forEach((key) => {
    message = message.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), values[key] || '')
  })

  return message.replace(/{{\s*[\w]+\s*}}/g, '').trim()
}

export function openWhatsApp(phone, message) {
  const digits = String(phone || '').replace(/\D/g, '')
  const cleanPhone = digits.length === 10
    ? `91${digits}`
    : digits.startsWith('0') && digits.length === 11
      ? `91${digits.slice(1)}`
      : digits
  const encodedMessage = encodeURIComponent(message || '')
  const url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodedMessage}` : `https://wa.me/?text=${encodedMessage}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export { SUPPORTED_PLACEHOLDERS }
