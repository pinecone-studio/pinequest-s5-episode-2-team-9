// Loaded on demand, only on /admin. Firestore rules allow these reads for the admin account only.
import { collection, getDocs, getFirestore, limit, orderBy, query } from 'firebase/firestore'
import { app } from '../auth/firebase'
import type { Lang } from '../i18n'
import { toMillis } from '../progress/progress'
import type { PaymentStatus, PlanId, SubscriptionStatus } from '../billing/pricing'

const db = getFirestore(app)

export interface AdminUser {
  uid: string
  name: string | null
  email: string | null
  lang: Lang | null
  createdAt: number | null
  lastSeenAt: number | null
}

export interface AdminSubscription {
  uid: string
  plan: PlanId
  status: SubscriptionStatus
  currentPeriodEnd: number | null
}

export interface AdminPayment {
  id: string
  uid: string
  email: string | null
  plan: PlanId
  amountMnt: number
  status: PaymentStatus
  createdAt: number | null
  paidAt: number | null
}

export interface AdminData {
  users: AdminUser[]
  subscriptions: Record<string, AdminSubscription>
  payments: AdminPayment[]
}

const str = (v: unknown) => (typeof v === 'string' ? v : null)

export async function loadAdminData(): Promise<AdminData> {
  const [users, subs, payments] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'subscriptions')),
    getDocs(query(collection(db, 'payments'), orderBy('createdAt', 'desc'), limit(500))),
  ])
  const subscriptions: Record<string, AdminSubscription> = {}
  for (const d of subs.docs) {
    const s = d.data()
    subscriptions[d.id] = {
      uid: d.id,
      plan: s.plan ?? 'monthly',
      status: s.status ?? 'pending',
      currentPeriodEnd: toMillis(s.currentPeriodEnd),
    }
  }
  return {
    users: users.docs.map((d) => {
      const u = d.data()
      const lang = u.lang === 'mn' || u.lang === 'en' ? u.lang : null
      return {
        uid: d.id,
        name: str(u.name),
        email: str(u.email),
        lang,
        createdAt: toMillis(u.createdAt),
        lastSeenAt: toMillis(u.lastSeenAt),
      }
    }),
    subscriptions,
    payments: payments.docs.map((d) => {
      const p = d.data()
      return {
        id: d.id,
        uid: String(p.uid ?? ''),
        email: str(p.email),
        plan: p.plan ?? 'monthly',
        amountMnt: typeof p.amountMnt === 'number' ? p.amountMnt : 0,
        status: p.status ?? 'pending',
        createdAt: toMillis(p.createdAt),
        paidAt: toMillis(p.paidAt),
      }
    }),
  }
}
