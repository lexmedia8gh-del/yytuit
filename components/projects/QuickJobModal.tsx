'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  X,
  Zap,
  User,
  Plus,
  CheckCircle2,
  Copy,
  ExternalLink,
  MessageSquare,
  Search,
  FileText,
  DollarSign,
  Calendar,
  FolderKanban,
  Check,
  Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import {
  COLLECTIONS,
  getDocuments,
  getDocument,
  addDocument,
  writeBatch,
  db,
  doc,
  collection,
  serverTimestamp,
} from '@/lib/firebase/firestore'
import type { Client, Invoice, Project, BusinessSettings, ProjectStatus } from '@/lib/types'
import {
  formatCurrency,
  generateInvoiceNumber,
  generateSecureToken,
  copyToClipboard,
  getClientAppUrl,
  formatWhatsAppNumber,
} from '@/lib/utils'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

interface QuickJobModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

const QUICK_SERVICE_SUGGESTIONS = [
  'Passport Photos',
  'Photo Editing',
  'Logo Adjustment',
  'Social Media Design',
  'Printing Job',
  'Custom Consultation',
  'Equipment Service',
  'Event Coverage',
]

const STATUS_OPTIONS: ProjectStatus[] = [
  'In Progress',
  'Awaiting Payment',
  'Pending',
  'Confirmed',
  'Deliverables Ready',
  'Completed',
  'Cancelled',
]

export function QuickJobModal({ isOpen, onClose, onSuccess }: QuickJobModalProps) {
  const router = useRouter()

  // Step state: 'form' | 'success'
  const [step, setStep] = useState<'form' | 'success'>('form')

  // Client Selection Mode: 'existing' | 'new'
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing')

  // Existing clients state
  const [clients, setClients] = useState<Client[]>([])
  const [loadingClients, setLoadingClients] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  // New client fields
  const [newClientName, setNewClientName] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')

  // Quick Job fields
  const [jobTitle, setJobTitle] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [totalAmount, setTotalAmount] = useState<string>('')
  const [amountPaid, setAmountPaid] = useState<string>('0')
  const [jobDate, setJobDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<ProjectStatus>('In Progress')

  // Submission & Result state
  const [submitting, setSubmitting] = useState(false)
  const [createdResult, setCreatedResult] = useState<{
    projectId: string
    invoiceId: string
    invoiceNumber: string
    paymentUrl: string
    clientName: string
    clientPhone: string
    total: number
    paid: number
    balance: number
    jobTitle: string
  } | null>(null)

  const [copiedLink, setCopiedLink] = useState(false)
  const [sendingWA, setSendingWA] = useState(false)

  // Load clients on modal open
  useEffect(() => {
    if (isOpen) {
      setLoadingClients(true)
      getDocuments<Client>(COLLECTIONS.CLIENTS)
        .then((data) => {
          setClients(data)
          setLoadingClients(false)
        })
        .catch((err) => {
          console.error('Error fetching clients for Quick Job:', err)
          setLoadingClients(false)
        })
    }
  }, [isOpen])

  // Computed Balance
  const parsedTotal = parseFloat(totalAmount) || 0
  const parsedPaid = parseFloat(amountPaid) || 0
  const calculatedBalance = Math.max(0, parsedTotal - parsedPaid)

  // Reset form
  const handleReset = () => {
    setStep('form')
    setClientMode('existing')
    setSelectedClient(null)
    setClientSearch('')
    setNewClientName('')
    setNewClientEmail('')
    setNewClientPhone('')
    setJobTitle('')
    setJobDescription('')
    setTotalAmount('')
    setAmountPaid('0')
    setJobDate(new Date().toISOString().split('T')[0])
    setDueDate('')
    setNotes('')
    setStatus('In Progress')
    setCreatedResult(null)
    setCopiedLink(false)
  }

  const handleClose = () => {
    handleReset()
    onClose()
  }

  // Submit Handler
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      if (!jobTitle.trim()) {
        toast.error('Please enter a Job Title / Custom Service name.')
        return
      }

      if (parsedTotal <= 0) {
        toast.error('Please enter a valid Total Amount.')
        return
      }

      let activeClient: { id: string; fullName: string; email: string; phone: string } | null = null

      if (clientMode === 'existing') {
        if (!selectedClient) {
          toast.error('Please select an existing client or create a new one.')
          return
        }
        activeClient = {
          id: selectedClient.id,
          fullName: selectedClient.fullName,
          email: selectedClient.email || '',
          phone: selectedClient.phone || '',
        }
      } else {
        if (!newClientName.trim()) {
          toast.error('Please enter the Client Full Name.')
          return
        }
        if (!newClientEmail.trim() && !newClientPhone.trim()) {
          toast.error('Please provide at least a Client Email or Phone Number.')
          return
        }
      }

      setSubmitting(true)

      try {
        // 1. If new client mode, create client document first
        if (clientMode === 'new') {
          // Check if existing client matches email or phone
          const existingMatches = clients.filter(
            (c) =>
              (newClientEmail && c.email?.toLowerCase() === newClientEmail.toLowerCase().trim()) ||
              (newClientPhone && c.phone?.trim() === newClientPhone.trim())
          )

          if (existingMatches.length > 0) {
            const match = existingMatches[0]
            activeClient = {
              id: match.id,
              fullName: match.fullName,
              email: match.email || '',
              phone: match.phone || '',
            }
          } else {
            const newClientRef = doc(collection(db, COLLECTIONS.CLIENTS))
            const newClientData = {
              fullName: newClientName.trim(),
              email: newClientEmail.trim(),
              phone: newClientPhone.trim(),
              status: 'active' as const,
              projectCount: 0,
              totalBilled: 0,
              totalPaid: 0,
              outstandingBalance: 0,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              createdBy: 'admin',
            }
            const batchClient = writeBatch(db)
            batchClient.set(newClientRef, newClientData)
            await batchClient.commit()

            activeClient = {
              id: newClientRef.id,
              fullName: newClientName.trim(),
              email: newClientEmail.trim(),
              phone: newClientPhone.trim(),
            }
          }
        }

        if (!activeClient) throw new Error('Failed to resolve client.')

        // 2. Invoice number generation
        const existingInvoices = await getDocuments<Invoice>(COLLECTIONS.INVOICES)
        const bizSettings = await getDocument<BusinessSettings>(COLLECTIONS.SETTINGS, 'business')
        const invoicePrefix = bizSettings?.invoicePrefix || 'LXM-INV'
        const invoiceStartNum = bizSettings?.invoiceStartNumber || 1
        const invoiceNumber = generateInvoiceNumber(
          invoicePrefix,
          invoiceStartNum + existingInvoices.length
        )

        // 3. Prepare Batch Write
        const projectRef = doc(collection(db, COLLECTIONS.PROJECTS))
        const invoiceRef = doc(collection(db, COLLECTIONS.INVOICES))
        const batch = writeBatch(db)

        const paymentStatus =
          calculatedBalance <= 0 ? 'Paid' : parsedPaid > 0 ? 'Partially Paid' : 'Unpaid'

        // Save Project document
        batch.set(projectRef, {
          name: jobTitle.trim(),
          clientId: activeClient.id,
          clientName: activeClient.fullName,
          clientEmail: activeClient.email,
          clientPhone: activeClient.phone,
          serviceId: 'quick-job',
          serviceName: jobTitle.trim(),
          invoiceId: invoiceRef.id,
          invoiceNumber,
          description: jobDescription.trim() || undefined,
          price: parsedTotal,
          depositAmount: parsedPaid,
          amountPaid: parsedPaid,
          outstandingBalance: calculatedBalance,
          currency: 'GHS',
          status: status,
          paymentStatus: paymentStatus,
          progress:
            status === 'Completed'
              ? 100
              : status === 'Deliverables Ready'
              ? 90
              : status === 'In Progress'
              ? 50
              : 0,
          isQuickJob: true,
          jobDate: jobDate ? new Date(jobDate) : new Date(),
          deadline: dueDate ? new Date(dueDate) : null,
          notes: notes.trim() || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: 'admin',
        })

        // Save Invoice document
        batch.set(invoiceRef, {
          invoiceNumber,
          clientId: activeClient.id,
          clientName: activeClient.fullName,
          clientEmail: activeClient.email,
          projectId: projectRef.id,
          projectName: jobTitle.trim(),
          serviceName: jobTitle.trim(),
          items: [
            {
              id: `item_${Date.now()}`,
              description: jobTitle.trim(),
              quantity: 1,
              unitPrice: parsedTotal,
              total: parsedTotal,
            },
          ],
          subtotal: parsedTotal,
          discountAmount: 0,
          taxAmount: 0,
          total: parsedTotal,
          amountPaid: parsedPaid,
          balanceDue: calculatedBalance,
          currency: 'GHS',
          status: calculatedBalance <= 0 ? 'Paid' : parsedPaid > 0 ? 'Partially Paid' : 'Pending',
          invoiceDate: serverTimestamp(),
          dueDate: dueDate ? new Date(dueDate) : null,
          notes: notes.trim() || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: 'admin',
        })

        // Update Client Counters
        const clientRef = doc(db, COLLECTIONS.CLIENTS, activeClient.id)
        batch.update(clientRef, {
          projectCount: (selectedClient?.projectCount || 0) + 1,
          totalBilled: (selectedClient?.totalBilled || 0) + parsedTotal,
          totalPaid: (selectedClient?.totalPaid || 0) + parsedPaid,
          outstandingBalance: (selectedClient?.outstandingBalance || 0) + calculatedBalance,
          updatedAt: serverTimestamp(),
        })

        await batch.commit()

        // 4. Create Paystack Client Link
        const linkToken = generateSecureToken('p_')
        const appUrl = getClientAppUrl()
        const paymentUrl = `${appUrl}/pay/${linkToken}`

        await addDocument(COLLECTIONS.CLIENT_LINKS, {
          token: linkToken,
          clientId: activeClient.id,
          clientName: activeClient.fullName,
          projectId: projectRef.id,
          projectName: jobTitle.trim(),
          invoiceId: invoiceRef.id,
          invoiceNumber,
          amount: calculatedBalance > 0 ? calculatedBalance : parsedTotal,
          currency: 'GHS',
          status: calculatedBalance <= 0 ? 'Paid' : 'Pending Payment',
          paymentStatus: paymentStatus,
          viewCount: 0,
          createdBy: 'admin',
        })

        // Set Result & Success Step
        setCreatedResult({
          projectId: projectRef.id,
          invoiceId: invoiceRef.id,
          invoiceNumber,
          paymentUrl,
          clientName: activeClient.fullName,
          clientPhone: activeClient.phone,
          total: parsedTotal,
          paid: parsedPaid,
          balance: calculatedBalance,
          jobTitle: jobTitle.trim(),
        })

        setStep('success')
        toast.success('Quick Job created successfully!')
        onSuccess?.()
      } catch (err: any) {
        console.error('Error creating Quick Job:', err)
        toast.error(err?.message || 'Failed to create Quick Job.')
      } finally {
        setSubmitting(false)
      }
    },
    [
      jobTitle,
      parsedTotal,
      parsedPaid,
      calculatedBalance,
      clientMode,
      selectedClient,
      newClientName,
      newClientEmail,
      newClientPhone,
      clients,
      jobDescription,
      status,
      jobDate,
      dueDate,
      notes,
      onSuccess,
    ]
  )

  // Filter existing clients
  const filteredClients = clients.filter(
    (c) =>
      c.fullName.toLowerCase().includes(clientSearch.toLowerCase()) ||
      (c.email && c.email.toLowerCase().includes(clientSearch.toLowerCase())) ||
      (c.phone && c.phone.toLowerCase().includes(clientSearch.toLowerCase()))
  )

  // Send WhatsApp message handler
  const handleWhatsAppShare = () => {
    if (!createdResult) return
    setSendingWA(true)

    const rawPhone = createdResult.clientPhone
    const cleanPhone = formatWhatsAppNumber(rawPhone)

    const message = `Hello ${createdResult.clientName}! 👋\n\nYour job *${createdResult.jobTitle}* (Invoice *${createdResult.invoiceNumber}*) has been recorded.\n\n📋 Job: ${createdResult.jobTitle}\n💰 Total Amount: ${formatCurrency(createdResult.total)}\n💳 Amount Paid: ${formatCurrency(createdResult.paid)}\n⚡ Remaining Balance: ${formatCurrency(createdResult.balance)}\n\n🔗 View Job & Payment Portal:\n${createdResult.paymentUrl}\n\nThank you for choosing LEXMEDIA.GH! 🙏`

    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`

    window.open(waUrl, '_blank')
    setSendingWA(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-2xl overflow-hidden my-auto transition-all">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              <Zap size={20} className="fill-indigo-300" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Create Quick Job</h2>
              <p className="text-xs text-indigo-200/80">
                Fast custom service logging with instant invoice & payment link
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 sm:p-6 max-h-[80vh] overflow-y-auto">
          {step === 'form' ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* 1. Client Section */}
              <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <User size={14} className="text-indigo-600" />
                    Client Details
                  </label>
                  <div className="flex bg-slate-200/80 p-0.5 rounded-lg text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setClientMode('existing')}
                      className={`px-3 py-1 rounded-md transition-all ${
                        clientMode === 'existing'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Existing Client
                    </button>
                    <button
                      type="button"
                      onClick={() => setClientMode('new')}
                      className={`px-3 py-1 rounded-md transition-all ${
                        clientMode === 'new'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      + New Client
                    </button>
                  </div>
                </div>

                {clientMode === 'existing' ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <Input
                        placeholder="Search client by name, email, or phone..."
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        leftIcon={<Search size={15} className="text-slate-400" />}
                      />
                    </div>

                    {loadingClients ? (
                      <div className="py-4 flex justify-center">
                        <Spinner size="sm" />
                      </div>
                    ) : selectedClient ? (
                      <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-indigo-950">
                            {selectedClient.fullName}
                          </div>
                          <div className="text-[11px] text-indigo-700">
                            {selectedClient.email || 'No email'} {selectedClient.phone ? `• ${selectedClient.phone}` : ''}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => setSelectedClient(null)}
                          className="text-indigo-600 hover:bg-indigo-100"
                        >
                          Change
                        </Button>
                      </div>
                    ) : (
                      <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 bg-white rounded-lg border border-slate-200">
                        {filteredClients.length === 0 ? (
                          <div className="p-3 text-xs text-slate-500 text-center">
                            No clients found.{' '}
                            <button
                              type="button"
                              onClick={() => setClientMode('new')}
                              className="text-indigo-600 font-semibold underline"
                            >
                              Create new client
                            </button>
                          </div>
                        ) : (
                          filteredClients.map((client) => (
                            <button
                              key={client.id}
                              type="button"
                              onClick={() => setSelectedClient(client)}
                              className="w-full p-2.5 text-left hover:bg-slate-50 transition-colors flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-semibold text-slate-900">
                                  {client.fullName}
                                </span>
                                <span className="text-slate-400 ml-2 text-[11px]">
                                  {client.email || client.phone}
                                </span>
                              </div>
                              <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                Select
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Full Name *
                      </label>
                      <Input
                        placeholder="e.g. Ama Mensah"
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Email Address
                      </label>
                      <Input
                        type="email"
                        placeholder="client@gmail.com"
                        value={newClientEmail}
                        onChange={(e) => setNewClientEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Phone / WhatsApp
                      </label>
                      <Input
                        placeholder="024XXXXXXX"
                        value={newClientPhone}
                        onChange={(e) => setNewClientPhone(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Custom Job Title & Details */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1.5">
                    Job Title / Custom Service *
                  </label>
                  <Input
                    placeholder="e.g. Passport Photos, Photo Editing, Printing Job..."
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    required
                  />

                  {/* Service Suggestion Pills */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                      <Tag size={10} /> Quick Suggestions:
                    </span>
                    {QUICK_SERVICE_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setJobTitle(suggestion)}
                        className={`text-[11px] px-2.5 py-0.5 rounded-full transition-colors border ${
                          jobTitle === suggestion
                            ? 'bg-indigo-600 text-white border-indigo-600 font-semibold'
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Job Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Provide specific notes or specifications for this custom job..."
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
                  />
                </div>
              </div>

              {/* 3. Pricing & Financials */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/80 p-4 rounded-xl border border-slate-200/80">
                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Total Amount (GHS) *
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Amount Paid / Deposit (GHS)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">
                    Calculated Balance
                  </label>
                  <div className="h-10 px-3 bg-white border border-slate-300 rounded-xl flex items-center font-bold text-xs text-rose-600">
                    {formatCurrency(calculatedBalance)}
                  </div>
                </div>
              </div>

              {/* 4. Dates & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Job Date
                  </label>
                  <Input
                    type="date"
                    value={jobDate}
                    onChange={(e) => setJobDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Due Date (Optional)
                  </label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Job Status
                  </label>
                  <select
                    value={status}
                    onChange={(e: any) => setStatus(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
                  >
                    {STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex justify-end gap-2.5 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="accent"
                  loading={submitting}
                  icon={<Zap size={16} className="fill-current" />}
                >
                  Create Quick Job
                </Button>
              </div>
            </form>
          ) : (
            /* Success View */
            <div className="space-y-5 text-center animate-fade-in py-2">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 size={32} />
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Quick Job Logged Successfully!
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Job created for <span className="font-semibold text-slate-800">{createdResult?.clientName}</span>
                </p>
              </div>

              {/* Summary Details */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left space-y-2 text-xs">
                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-slate-500 font-medium">Job Title:</span>
                  <span className="font-bold text-slate-900">{createdResult?.jobTitle}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-slate-500 font-medium">Invoice Number:</span>
                  <span className="font-mono font-bold text-indigo-600">{createdResult?.invoiceNumber}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-slate-500 font-medium">Total Amount:</span>
                  <span className="font-bold text-slate-900">{formatCurrency(createdResult?.total || 0)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-slate-500 font-medium">Amount Paid:</span>
                  <span className="font-bold text-emerald-600">{formatCurrency(createdResult?.paid || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Remaining Balance:</span>
                  <span className="font-bold text-rose-600">{formatCurrency(createdResult?.balance || 0)}</span>
                </div>
              </div>

              {/* Paystack Share Link */}
              <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-200/80 text-left space-y-2">
                <span className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider block">
                  Paystack Payment & Delivery Portal Link
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={createdResult?.paymentUrl || ''}
                    className="flex-1 h-9 px-3 bg-white text-xs font-mono border border-indigo-200 rounded-lg outline-none text-slate-700"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    icon={copiedLink ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    onClick={() => {
                      if (createdResult?.paymentUrl) {
                        copyToClipboard(createdResult.paymentUrl)
                        setCopiedLink(true)
                        toast.success('Payment link copied!')
                        setTimeout(() => setCopiedLink(false), 2000)
                      }
                    }}
                  >
                    {copiedLink ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleWhatsAppShare}
                  loading={sendingWA}
                  icon={<MessageSquare size={16} className="text-emerald-600" />}
                >
                  Share via WhatsApp
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  icon={<FolderKanban size={16} />}
                  onClick={() => {
                    handleClose()
                    if (createdResult?.projectId) {
                      router.push(`/projects/${createdResult.projectId}`)
                    }
                  }}
                >
                  View Job & Upload Files
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleReset}
                  icon={<Plus size={16} />}
                >
                  Create Another
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
