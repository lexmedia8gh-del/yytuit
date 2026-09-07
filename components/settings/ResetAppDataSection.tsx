'use client'

import React, { useState, useEffect } from 'react'
import {
  AlertTriangle,
  Trash2,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  Database,
  Layers,
  Sparkles,
  AlertCircle,
  FileBox,
  Lock,
  ArrowRight,
  Info,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { auth } from '@/lib/firebase/config'
import toast from 'react-hot-toast'

interface OperationalCounts {
  clients: number
  projects: number
  invoices: number
  payments: number
  deliveries: number
  deliveryFiles: number
  clientLinks: number
  notifications: number
  activityLogs: number
  packages: number
  services: number
}

type ResetMode = 'clear_test_data' | 'full_operational_reset'

export function ResetAppDataSection() {
  const [counts, setCounts] = useState<OperationalCounts | null>(null)
  const [loadingCounts, setLoadingCounts] = useState<boolean>(true)

  // Modal states
  const [activeModal, setActiveModal] = useState<ResetMode | null>(null)
  const [confirmInput, setConfirmInput] = useState<string>('')
  const [includeTemplates, setIncludeTemplates] = useState<boolean>(false)
  const [isResetting, setIsResetting] = useState<boolean>(false)
  const [resetCompleted, setResetCompleted] = useState<boolean>(false)
  const [completionSummary, setCompletionSummary] = useState<{
    message: string
    deletedCounts?: Record<string, number>
  } | null>(null)

  const fetchRecordCounts = async () => {
    setLoadingCounts(true)
    try {
      let token = ''
      if (auth?.currentUser) {
        token = await auth.currentUser.getIdToken()
      }
      const res = await fetch('/api/admin/reset-data', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.ok && data.counts) {
          setCounts(data.counts)
        }
      }
    } catch (err) {
      console.warn('Failed to load database counts:', err)
    } finally {
      setLoadingCounts(false)
    }
  }

  useEffect(() => {
    fetchRecordCounts()
  }, [])

  const openModal = (mode: ResetMode) => {
    setActiveModal(mode)
    setConfirmInput('')
    setIncludeTemplates(mode === 'full_operational_reset')
    setResetCompleted(false)
    setCompletionSummary(null)
  }

  const closeModal = () => {
    if (isResetting) return
    setActiveModal(null)
    setConfirmInput('')
    setResetCompleted(false)
    setCompletionSummary(null)
  }

  const handleExecuteReset = async () => {
    if (confirmInput.trim() !== 'RESET') {
      toast.error('Please type RESET exactly as written.')
      return
    }

    if (!activeModal) return

    setIsResetting(true)
    try {
      let token = ''
      if (auth?.currentUser) {
        token = await auth.currentUser.getIdToken()
      }

      const res = await fetch('/api/admin/reset-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          mode: activeModal,
          confirmationText: 'RESET',
          includeTemplates: activeModal === 'full_operational_reset' ? includeTemplates : false,
        }),
      })

      const result = await res.json()

      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Reset operation failed.')
      }

      // Purge local storage cache for operational collections
      const keysToClear = [
        'clients',
        'projects',
        'invoices',
        'invoiceItems',
        'payments',
        'clientLinks',
        'deliveries',
        'deliveryFiles',
        'files',
        'notifications',
        'activityLogs',
        'whatsappMessages',
      ]
      if (includeTemplates) {
        keysToClear.push('packages', 'services')
      }

      keysToClear.forEach((k) => {
        try {
          localStorage.removeItem(`lexmedia_${k}`)
        } catch {}
      })

      setResetCompleted(true)
      setCompletionSummary({
        message: result.message,
        deletedCounts: result.deletedCounts,
      })

      toast.success('Application operational data successfully reset!')
      // Refresh local counts
      fetchRecordCounts()
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete reset.')
    } finally {
      setIsResetting(false)
    }
  }

  const handleFinishAndReload = () => {
    // Reload to ensure all client-side contexts, dashboard stats, and state reflect zero data
    window.location.href = '/dashboard'
  }

  const totalOperationalRecords = counts
    ? counts.clients +
      counts.projects +
      counts.invoices +
      counts.payments +
      counts.deliveries +
      counts.deliveryFiles
    : 0

  return (
    <div className="space-y-6">
      {/* Danger Zone Header Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-950/20 via-red-900/10 to-orange-950/20 border-2 border-rose-500/30 p-6 sm:p-7 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-xs font-semibold text-rose-700">
              <AlertTriangle size={13} className="text-rose-600 shrink-0" />
              <span>DANGER ZONE • PRODUCTION LAUNCH PREPARATION</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
              ⚠️ Reset App Data
            </h2>
            <p className="text-sm text-gray-600 max-w-2xl leading-relaxed">
              Safely wipe testing and operational data before opening Ctrl Room to real clients.
              Administrative access, branding, Brevo, and Supabase configurations are strictly
              preserved.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchRecordCounts}
            loading={loadingCounts}
            icon={<RefreshCw size={14} className={loadingCounts ? 'animate-spin' : ''} />}
            className="self-start sm:self-center shrink-0 border-gray-300 hover:bg-white/80"
          >
            Audit Live Records
          </Button>
        </div>

        {/* Live Database Telemetry Strip */}
        <div className="mt-6 pt-5 border-t border-rose-200/60">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Database size={13} className="text-rose-600" />
            Current Live Database Audit
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="bg-white/80 backdrop-blur-xs rounded-xl p-3 border border-rose-100 shadow-xs">
              <span className="text-[11px] text-gray-500 font-medium block">Clients</span>
              <span className="text-base font-bold text-gray-900">
                {loadingCounts ? '...' : counts?.clients ?? 0}
              </span>
            </div>
            <div className="bg-white/80 backdrop-blur-xs rounded-xl p-3 border border-rose-100 shadow-xs">
              <span className="text-[11px] text-gray-500 font-medium block">Jobs & Projects</span>
              <span className="text-base font-bold text-gray-900">
                {loadingCounts ? '...' : counts?.projects ?? 0}
              </span>
            </div>
            <div className="bg-white/80 backdrop-blur-xs rounded-xl p-3 border border-rose-100 shadow-xs">
              <span className="text-[11px] text-gray-500 font-medium block">Invoices</span>
              <span className="text-base font-bold text-gray-900">
                {loadingCounts ? '...' : counts?.invoices ?? 0}
              </span>
            </div>
            <div className="bg-white/80 backdrop-blur-xs rounded-xl p-3 border border-rose-100 shadow-xs">
              <span className="text-[11px] text-gray-500 font-medium block">Payments</span>
              <span className="text-base font-bold text-gray-900">
                {loadingCounts ? '...' : counts?.payments ?? 0}
              </span>
            </div>
            <div className="bg-white/80 backdrop-blur-xs rounded-xl p-3 border border-rose-100 shadow-xs">
              <span className="text-[11px] text-gray-500 font-medium block">Deliveries</span>
              <span className="text-base font-bold text-gray-900">
                {loadingCounts ? '...' : counts?.deliveries ?? 0}
              </span>
            </div>
            <div className="bg-white/80 backdrop-blur-xs rounded-xl p-3 border border-rose-100 shadow-xs">
              <span className="text-[11px] text-gray-500 font-medium block">Vault Files</span>
              <span className="text-base font-bold text-gray-900">
                {loadingCounts ? '...' : counts?.deliveryFiles ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Guaranteed Preservation Notice */}
      <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5">
        <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
          <ShieldCheck size={18} />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-emerald-900">
            Protected & Preserved Configurations
          </h4>
          <p className="text-xs text-emerald-800 leading-relaxed">
            Neither reset option will ever affect your admin credentials, login access, company/business
            settings, Ctrl Room branding and logos, Supabase credentials, or Brevo email and WhatsApp
            integration parameters.
          </p>
        </div>
      </div>

      {/* Two Reset Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Option 1: Clear Test Data */}
        <Card className="flex flex-col justify-between border-amber-200 hover:border-amber-300 transition-all shadow-xs">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center text-lg">
                🧹
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                Recommended for Launch
              </span>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900">Clear Test Data</h3>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                Permanently purges all operational testing records while keeping your configured service
                offerings and package pricing intact.
              </p>
            </div>

            <div className="space-y-2 pt-2 text-xs">
              <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                <Trash2 size={13} className="text-rose-500" />
                Will be permanently deleted:
              </p>
              <ul className="space-y-1 pl-5 list-disc text-gray-600">
                <li>All clients and client profiles</li>
                <li>All client jobs, projects, and Quick Jobs</li>
                <li>All invoices and invoice line items</li>
                <li>All payment records and payment history</li>
                <li>All delivery records and active delivery tokens</li>
                <li>All client delivery files in Supabase Storage</li>
                <li>Notifications, WhatsApp logs, and activity records</li>
              </ul>
            </div>

            <div className="space-y-2 pt-1 text-xs">
              <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-600" />
                Preserved:
              </p>
              <ul className="space-y-1 pl-5 list-disc text-emerald-800">
                <li>Admin account and login credentials</li>
                <li>Packages and Service pricing templates</li>
                <li>Business info, branding & uploaded logo</li>
                <li>Supabase & Brevo system configurations</li>
              </ul>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-gray-100">
            <Button
              variant="outline"
              className="w-full h-11 border-amber-300 bg-amber-50/60 hover:bg-amber-100/80 text-amber-900 font-semibold"
              onClick={() => openModal('clear_test_data')}
            >
              🧹 Clear Test Data
            </Button>
          </div>
        </Card>

        {/* Option 2: Full Operational Data Reset */}
        <Card className="flex flex-col justify-between border-rose-300 hover:border-rose-400 bg-rose-50/10 transition-all shadow-xs">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 border border-rose-200 flex items-center justify-center text-lg">
                ⚠️
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800">
                Deep Factory Wipe
              </span>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900">Full Operational Data Reset</h3>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                Completely deletes all operational data and optionally wipes all packages and service
                templates for a clean slate.
              </p>
            </div>

            <div className="space-y-2 pt-2 text-xs">
              <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                <Trash2 size={13} className="text-rose-500" />
                Will be permanently deleted:
              </p>
              <ul className="space-y-1 pl-5 list-disc text-gray-600">
                <li>All operational data (clients, jobs, invoices, payments)</li>
                <li>All files stored in Supabase Storage</li>
                <li>All delivery tokens and client links</li>
                <li>All notifications, activity records, and messages</li>
                <li className="font-medium text-rose-700">
                  Optionally deletes Packages and Service templates
                </li>
              </ul>
            </div>

            <div className="space-y-2 pt-1 text-xs">
              <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-600" />
                Strictly preserved:
              </p>
              <ul className="space-y-1 pl-5 list-disc text-emerald-800">
                <li>Admin user authentication & password</li>
                <li>Core application settings & branding</li>
                <li>Supabase & Brevo integration keys</li>
              </ul>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-rose-100">
            <Button
              variant="danger"
              className="w-full h-11 bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-xs"
              onClick={() => openModal('full_operational_reset')}
            >
              ⚠️ Full Operational Data Reset
            </Button>
          </div>
        </Card>
      </div>

      {/* Safety Confirmation Modal */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden animate-scale-up">
            {!resetCompleted ? (
              <>
                {/* Modal Header */}
                <div
                  className={`p-6 border-b ${
                    activeModal === 'full_operational_reset'
                      ? 'bg-rose-50 border-rose-100'
                      : 'bg-amber-50 border-amber-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        activeModal === 'full_operational_reset'
                          ? 'bg-rose-100 text-rose-600'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      <AlertTriangle size={22} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {activeModal === 'clear_test_data'
                          ? 'Confirm Clear Test Data'
                          : 'Confirm Full Operational Data Reset'}
                      </h3>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Permanent destruction of operational and testing records
                      </p>
                    </div>
                  </div>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-5">
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-900 space-y-2">
                    <p className="font-bold flex items-center gap-1.5 text-rose-800">
                      <AlertCircle size={14} className="shrink-0" />
                      CRITICAL WARNING: This action cannot be undone.
                    </p>
                    <p className="leading-relaxed">
                      All selected client records, projects, invoices, payments, and delivery files
                      uploaded to Supabase Storage will be permanently deleted from the database and
                      cloud storage.
                    </p>
                  </div>

                  {/* Pre-reset audit item list */}
                  <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-2 text-xs">
                    <div className="flex justify-between font-semibold text-gray-900 border-b border-gray-200 pb-2">
                      <span>Operational records detected:</span>
                      <span className="font-mono text-rose-600 font-bold">
                        {totalOperationalRecords} records
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-y-1 text-gray-600 pt-1">
                      <span>• Clients: {counts?.clients ?? 0}</span>
                      <span>• Projects/Jobs: {counts?.projects ?? 0}</span>
                      <span>• Invoices: {counts?.invoices ?? 0}</span>
                      <span>• Payments: {counts?.payments ?? 0}</span>
                      <span>• Deliveries: {counts?.deliveries ?? 0}</span>
                      <span>• Storage Files: {counts?.deliveryFiles ?? 0}</span>
                    </div>
                  </div>

                  {/* Template deletion option for Full Operational Reset */}
                  {activeModal === 'full_operational_reset' && (
                    <label className="flex items-start gap-3 p-3.5 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors select-none">
                      <input
                        type="checkbox"
                        checked={includeTemplates}
                        onChange={(e) => setIncludeTemplates(e.target.checked)}
                        disabled={isResetting}
                        className="w-4 h-4 mt-0.5 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-gray-900 block">
                          Also delete Packages and Service Templates ({counts?.packages ?? 0} packages,{' '}
                          {counts?.services ?? 0} services)
                        </span>
                        <span className="text-gray-500 mt-0.5 block">
                          Check this if you want to rebuild your service pricing catalog from scratch.
                        </span>
                      </div>
                    </label>
                  )}

                  {/* Strict Confirmation Input */}
                  <div className="space-y-2 pt-1">
                    <label className="block text-xs font-bold text-gray-900">
                      To confirm this action, type <span className="text-rose-600 font-mono">RESET</span> below:
                    </label>
                    <Input
                      type="text"
                      placeholder="Type RESET to confirm"
                      value={confirmInput}
                      onChange={(e) => setConfirmInput(e.target.value)}
                      disabled={isResetting}
                      className="font-mono text-sm tracking-wider uppercase"
                    />
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="p-4 sm:p-6 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={closeModal}
                    disabled={isResetting}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    disabled={confirmInput.trim() !== 'RESET' || isResetting}
                    loading={isResetting}
                    onClick={handleExecuteReset}
                    className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white font-bold"
                  >
                    {isResetting ? (
                      'Resetting application data... Please wait.'
                    ) : (
                      'Permanently Delete Data'
                    )}
                  </Button>
                </div>
              </>
            ) : (
              /* Success / Completed State */
              <div className="p-8 text-center space-y-5 animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={36} />
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-gray-900">Reset Completed Successfully</h3>
                  <p className="text-sm text-gray-600 max-w-sm mx-auto leading-relaxed">
                    {completionSummary?.message ||
                      'All operational test data has been permanently cleared. Your system is pristine and ready for live production launch.'}
                  </p>
                </div>

                {completionSummary?.deletedCounts && (
                  <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-xs text-left max-w-xs mx-auto space-y-1 text-gray-700">
                    <p className="font-bold text-gray-900 border-b border-gray-200 pb-1 mb-2">
                      Purged Record Summary:
                    </p>
                    <p>• Clients removed: {completionSummary.deletedCounts.clients ?? 0}</p>
                    <p>• Projects removed: {completionSummary.deletedCounts.projects ?? 0}</p>
                    <p>• Invoices removed: {completionSummary.deletedCounts.invoices ?? 0}</p>
                    <p>• Payments removed: {completionSummary.deletedCounts.payments ?? 0}</p>
                    <p>• Deliveries removed: {completionSummary.deletedCounts.deliveries ?? 0}</p>
                    <p>
                      • Cloud Files purged: {completionSummary.deletedCounts.supabaseStorageFiles ?? 0}
                    </p>
                  </div>
                )}

                <div className="pt-3">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleFinishAndReload}
                    className="w-full sm:w-auto px-8"
                    icon={<ArrowRight size={16} />}
                  >
                    Return to Clean Dashboard
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
