import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { SUPPORTED_PLACEHOLDERS } from '../../utils/whatsappTemplates'

const templateTypes = [
  ['lead_follow_up', 'Lead Follow-up'],
  ['walkin_follow_up', 'Walk-in Follow-up'],
  ['payment_reminder', 'Payment Reminder'],
  ['birthday_wish', 'Birthday Wish'],
  ['rules_form_link', 'Rules Form Link'],
  ['offer_message', 'Offer Message'],
]

const initialForm = {
  name: '',
  template_type: 'lead_follow_up',
  message_body: '',
  wati_template_name: '',
  wati_language_code: 'en',
  is_active: true,
}

export default function WhatsAppTemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState(null)
  const [message, setMessage] = useState('')

  const load = async () => {
    const { data } = await api.get('/whatsapp-templates/')
    setTemplates(data.results || data)
  }

  useEffect(() => { load() }, [])

  const save = async (event) => {
    event.preventDefault()
    if (editingId) {
      await api.patch(`/whatsapp-templates/${editingId}/`, form)
      setMessage('Template updated.')
    } else {
      await api.post('/whatsapp-templates/', form)
      setMessage('Template created.')
    }
    setForm(initialForm)
    setEditingId(null)
    await load()
  }

  const edit = (template) => {
    setEditingId(template.id)
    setForm({
      name: template.name,
      template_type: template.template_type,
      message_body: template.message_body,
      wati_template_name: template.wati_template_name || '',
      wati_language_code: template.wati_language_code || 'en',
      is_active: template.is_active,
    })
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">WhatsApp Templates</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Reusable message templates</h1>
        <p className="mt-3 text-sm text-slate-500">
          Placeholders: {SUPPORTED_PLACEHOLDERS.map((key) => `{{${key}}}`).join(', ')}
        </p>
      </section>
      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form onSubmit={save} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-black tracking-tight text-slate-950">{editingId ? 'Edit template' : 'New template'}</h2>
          <div className="mt-5 space-y-4">
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Template name" required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
            <select value={form.template_type} onChange={(event) => setForm({ ...form, template_type: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              {templateTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input value={form.wati_template_name} onChange={(event) => setForm({ ...form, wati_template_name: event.target.value })} placeholder="WATI approved template name" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
            <input value={form.wati_language_code} onChange={(event) => setForm({ ...form, wati_language_code: event.target.value })} placeholder="WATI language code" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
            <textarea value={form.message_body} onChange={(event) => setForm({ ...form, message_body: event.target.value })} placeholder="Message body" required className="min-h-[180px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
            <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
              Active
            </label>
          </div>
          {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
          <button className="mt-6 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">Save Template</button>
        </form>
        <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <div className="divide-y divide-slate-200">
            {templates.map((template) => (
              <div key={template.id} className="px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold text-slate-950">{template.name}</p>
                    <p className="text-sm text-slate-500">{template.template_type_display}</p>
                    {template.wati_template_name && (
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">WATI: {template.wati_template_name}</p>
                    )}
                  </div>
                  <button onClick={() => edit(template)} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white">Edit</button>
                </div>
                <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">{template.message_body}</p>
              </div>
            ))}
          </div>
        </section>
      </section>
    </div>
  )
}
