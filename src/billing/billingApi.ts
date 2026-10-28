// Calls to our /api functions. Each carries the user's Firebase ID token so the server knows who pays.
import type { Lang } from '../i18n'

export interface Invoice {
  invoiceId: string
  expiresAt: number | null
  qrText: string | null
  qrImageUrl: string | null
  deeplinks: { name: string; link: string; logo?: string }[]
  redirectUrl: string | null
}

export type PaymentCheck =
  { status: 'paid'; currentPeriodEnd: number } | { status: 'pending' | 'expired' | 'failed' }

async function post<T>(path: string, body: unknown): Promise<T> {
  const { auth } = await import('../auth/firebase')
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Not signed in')
  const res = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`/api/${path} ${res.status}`)
  return (await res.json()) as T
}

export const createInvoice = (lang: Lang) => post<Invoice>('create-invoice', { lang })

export const checkPayment = (invoiceId: string) => post<PaymentCheck>('check-payment', { invoiceId })
