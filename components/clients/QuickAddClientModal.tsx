'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Zap,
  X,
  Sparkles,
  User,
  AlertTriangle,
  Eye,
  CheckCircle2,
  FolderPlus,
  ArrowRight,
  RotateCcw,
  Plus,
  Copy,
  MessageSquare,
  FileText,
  DollarSign,
  Calendar,
  Building2,
  Phone,
  Mail,
  Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import {
  COLLECTIONS,
  getDocuments,
  addDocument,
  writeBatch,
  db,
  doc,
  collection,
  serverTimestamp,
} from '@/lib/firebase/firestore'
import type { Client, Invoice, ProjectStatus } from '@/lib/types'
import {
  formatCurrency,
  generateInvoiceNumber,
  generateSecureToken,
  getClientAppUrl,
} from '@/lib/utils'
import { RequestClientInfoModal } from './RequestClientInfoModal'
import toast from 'react-hot-toast'

interface QuickAddClientModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (clientId: string) => void
}

const SAMPLE_PASTE_TEXT = `John Mensah
+233 24 123 4567
john.mensah@apexghana.com
Company: Apex Ghana Ltd
Needs wedding photography and event coverage for December 20, 2026.
Preferred deadline: Dec 25
Budget is GH₵5,000`

export function QuickAddClientModal({
  isOpen,
  onClose,
  onSuccess,
}: QuickAddClientModalProps) {
  const router = useRouter()

  // Workflow Step: 'paste' | 'review' | 'success'
  const [step, setStep] = useState<'paste' | 'review' | 'success'>('paste')

  // Paste Text Input
  const [pastedText, setPastedText] = useState('')
  const [extracting, setExtracting] = useState(false)

  // Extracted Client Fields
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [company, setCompany] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')

  // Extracted Initial Service / Job details
  const [serviceRequested, setServiceRequested] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [preferredDeadline, setPreferredDeadline] = useState('')
  const [budgetText, setBudgetText] = useState('')

  // Initial Job Toggle Option
  const [createInitialJob, setCreateInitialJob] = useState(false)
  const [jobTitle, setJobTitle] = useState('')
  const [jobAmount, setJobAmount] = useState('')
  const [jobAmountPaid, setJobAmountPaid] = useState('0')
  const [jobStatus, setJobStatus] = useState<ProjectStatus>('In Progress')

  // Existing clients for duplicate detection
  const [clients, setClients] = useState<Client[]>([])
  const [duplicateClient, setDuplicateClient] = useState<Client | null>(null)
  const [ignoreDuplicate, setIgnoreDuplicate] = useState(false)

  // Submission State & Result
  const [submitting, setSubmitting] = useState(false)
  const [createdResult, setCreatedResult] = useState<{
    clientId: string
    clientName: string
    projectId?: string
    invoiceNumber?: string
  } | null>(null)

  // Sub-modal for Request Client Info
  const [showRequestInfoModal, setShowRequestInfoModal] = useState(false)

  // Fetch clients on open
  useEffect(() => {
    if (isOpen) {
      getDocuments<Client>(COLLECTIONS.CLIENTS)
        .then((data) => setClients(data))
        .catch((err) => console.error('Error loading clients for duplicate check:', err))
    }
  }, [isOpen])

  // Reset form state
  const handleReset = () => {
    setStep('paste')
    setPastedText('')
    setExtracting(false)
    setFullName('')
    setEmail('')
    setPhone('')
    setWhatsappNumber('')
    setCompany('')
    setAddress('')
    setNotes('')
    setServiceRequested('')
    setProjectDescription('')
    setEventDate('')
    setPreferredDeadline('')
    setBudgetText('')
    setCreateInitialJob(false)
    setJobTitle('')
    setJobAmount('')
    setJobAmountPaid('0')
    setJobStatus('In Progress')
    setDuplicateClient(null)
    setIgnoreDuplicate(false)
    setSubmitting(false)
    setCreatedResult(null)
  }

  const handleClose = () => {
    handleReset()
    onClose()
  }

  // Handle Extraction Call
  const handleExtract = async () => {
    if (!pastedText.trim()) {
      toast.error('Please paste client text or conversation first.')
      return
    }

    setExtracting(true)
    try {
      const res = await fetch('/api/ai/extract-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pastedText }),
      })

      const json = await res.json()
      const data = json?.data || {}

      // Fill state with extracted data
      const extractedName = data.fullName || ''
      const extractedEmail = data.email || ''
      const extractedPhone = data.phone || ''
      const extractedCompany = data.company || ''
      const extractedService = data.serviceRequested || ''
      const extractedDesc = data.projectDescription || ''
      const extractedEventDate = data.eventDate || ''
      const extractedDeadline = data.preferredDeadline || ''
      const extractedBudget = data.budget || ''
      const extractedNotes = data.notes || ''

      setFullName(extractedName)
      setEmail(extractedEmail)
      setPhone(extractedPhone)
      setWhatsappNumber(extractedPhone)
      setCompany(extractedCompany)
      setServiceRequested(extractedService)
      setProjectDescription(extractedDesc)
      setEventDate(extractedEventDate)
      setPreferredDeadline(extractedDeadline)
      setBudgetText(extractedBudget)

      // Format notes
      let combinedNotes = ''
      if (extractedDesc) combinedNotes += `Project Request: ${extractedDesc}\n`
      if (extractedEventDate) combinedNotes += `Event/Project Date: ${extractedEventDate}\n`
      if (extractedDeadline) combinedNotes += `Preferred Deadline: ${extractedDeadline}\n`
      if (extractedBudget) combinedNotes += `Estimated Budget: ${extractedBudget}\n`
      if (extractedNotes) combinedNotes += `Additional Notes: ${extractedNotes}`

      setNotes(combinedNotes.trim())

      // Auto check if initial job details exist
      if (extractedService || extractedDesc || extractedBudget) {
        setCreateInitialJob(true)
        setJobTitle(extractedService || extractedDesc.slice(0, 40) || 'Initial Client Request')

        // Parse numerical budget
        const rawNum = extractedBudget.replace(/[^0-9.]/g, '')
        if (rawNum) setJobAmount(rawNum)
      }

      // Check for duplicate client
      checkForDuplicate(extractedEmail, extractedPhone)

      setStep('review')
      toast.success('Information extracted successfully!')
    } catch (err) {
      console.error('Error extracting client info:', err)
      toast.error('Failed to extract client information. You can enter details manually.')
      setStep('review')
    } finally {
      setExtracting(false)
    }
  }

  // Duplicate client detector
  const checkForDuplicate = (emailToCheck: string, phoneToCheck: string) => {
    const cleanPhone = phoneToCheck.replace(/\D/g, '')
    const cleanEmail = emailToCheck.trim().toLowerCase()

    const match = clients.find((c) => {
      const matchEmail = cleanEmail && c.email?.trim().toLowerCase() === cleanEmail
      const matchPhone =
        cleanPhone &&
        (c.phone?.replace(/\D/g, '').includes(cleanPhone) ||
          c.whatsappNumber?.replace(/\D/g, '').includes(cleanPhone))
      return matchEmail || matchPhone
    })

    if (match) {
      setDuplicateClient(match)
      setIgnoreDuplicate(false)
    } else {
      setDuplicateClient(null)
    }
  }

  // Monitor manual changes to email or phone during review
  const handleEmailChange = (val: string) => {
    setEmail(val)
    checkForDuplicate(val, phone)
  }

  const handlePhoneChange = (val: string) => {
    setPhone(val)
    checkForDuplicate(email, val)
  }

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!fullName.trim()) {
      toast.error('Please enter the Client Full Name.')
      return
    }

    if (!email.trim() && !phone.trim()) {
      toast.error('Please provide at least an Email address or Phone number.')
      return
    }

    if (duplicateClient && !ignoreDuplicate) {
      toast.error('A duplicate client was detected. Click "Continue Anyway" to override.')
      return
    }

    setSubmitting(true)

    try {
      // 1. Create Client
      const clientData = {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        whatsappNumber: whatsappNumber.trim() || phone.trim(),
        company: company.trim(),
        address: address.trim(),
        notes: notes.trim(),
        status: 'active' as const,
        projectCount: createInitialJob ? 1 : 0,
        totalBilled: createInitialJob ? parseFloat(jobAmount) || 0 : 0,
        totalPaid: createInitialJob ? parseFloat(jobAmountPaid) || 0 : 0,
        outstandingBalance: createInitialJob
          ? Math.max(0, (parseFloat(jobAmount) || 0) - (parseFloat(jobAmountPaid) || 0))
          : 0,
        createdBy: 'admin',
      }

      const newClientId = await addDocument(COLLECTIONS.CLIENTS, clientData)

      let createdProjectId: string | undefined = undefined
      let createdInvoiceNum: string | undefined = undefined

      // 2. Optionally Create Initial Job/Project
      if (createInitialJob) {
        const parsedTotal = parseFloat(jobAmount) || 0
        const parsedPaid = parseFloat(jobAmountPaid) || 0
        const calculatedBalance = Math.max(0, parsedTotal - parsedPaid)

        // Generate invoice number
        const existingInvoices = await getDocuments<Invoice>(COLLECTIONS.INVOICES)
        const invoiceNumber = generateInvoiceNumber('LXM-INV', 1 + existingInvoices.length)

        const projectRef = doc(collection(db, COLLECTIONS.PROJECTS))
        const invoiceRef = doc(collection(db, COLLECTIONS.INVOICES))
        const batch = writeBatch(db)

        const paymentStatus =
          calculatedBalance <= 0
            ? 'Paid'
            : parsedPaid > 0
            ? 'Partially Paid'
            : 'Unpaid'

        // Save Project
        batch.set(projectRef, {
          name: jobTitle.trim() || serviceRequested || 'Initial Client Project',
          clientId: newClientId,
          clientName: fullName.trim(),
          clientEmail: email.trim(),
          clientPhone: phone.trim(),
          serviceId: 'quick-intake-job',
          serviceName: serviceRequested.trim() || 'Custom Client Request',
          invoiceId: invoiceRef.id,
          invoiceNumber,
          description: projectDescription.trim() || notes.trim(),
          price: parsedTotal,
          depositAmount: parsedPaid,
          amountPaid: parsedPaid,
          outstandingBalance: calculatedBalance,
          currency: 'GHS',
          status: jobStatus,
          paymentStatus,
          progress: jobStatus === 'Completed' ? 100 : 25,
          isQuickJob: true,
          jobDate: new Date(),
          deadline: preferredDeadline ? new Date(preferredDeadline) : null,
          notes: notes.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: 'admin',
        })

        // Save Invoice
        batch.set(invoiceRef, {
          invoiceNumber,
          clientId: newClientId,
          clientName: fullName.trim(),
          clientEmail: email.trim(),
          projectId: projectRef.id,
          projectName: jobTitle.trim() || 'Initial Client Project',
          serviceName: serviceRequested.trim() || 'Custom Client Service',
          items: [
            {
              id: `item_${Date.now()}`,
              description: jobTitle.trim() || 'Initial Client Service Request',
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
          dueDate: preferredDeadline ? new Date(preferredDeadline) : null,
          notes: notes.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: 'admin',
        })

        await batch.commit()

        // Create Paystack Payment Link if needed
        const linkToken = generateSecureToken('p_')
        await addDocument(COLLECTIONS.CLIENT_LINKS, {
          token: linkToken,
          clientId: newClientId,
          clientName: fullName.trim(),
          projectId: projectRef.id,
          projectName: jobTitle.trim() || 'Initial Client Project',
          invoiceId: invoiceRef.id,
          invoiceNumber,
          amount: calculatedBalance > 0 ? calculatedBalance : parsedTotal,
          currency: 'GHS',
          status: calculatedBalance <= 0 ? 'Paid' : 'Pending Payment',
          paymentStatus,
          viewCount: 0,
          createdBy: 'admin',
        })

        createdProjectId = projectRef.id
        createdInvoiceNum = invoiceNumber
      }

      setCreatedResult({
        clientId: newClientId,
        clientName: fullName.trim(),
        projectId: createdProjectId,
        invoiceNumber: createdInvoiceNum,
      })

      setStep('success')
      toast.success(
        createInitialJob
          ? 'Client & Initial Job created successfully!'
          : 'Client created successfully!'
      )
      onSuccess?.(newClientId)
    } catch (err: any) {
      console.error('Error creating Quick Client:', err)
      toast.error(err?.message || 'Failed to create client.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="⚡ Quick Add Client Intake"
        size="lg"
      >
        <div className="space-y-4">
          {/* Top Banner / Request Info Trigger */}
          <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 p-3 rounded-xl border border-indigo-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-600 shrink-0" />
              <p className="text-xs text-indigo-950 font-medium">
                Need to request info from the client first?
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="xs"
              icon={<MessageSquare size={13} className="text-indigo-600" />}
              onClick={() => setShowRequestInfoModal(true)}
              className="bg-white hover:bg-indigo-50 text-indigo-700 border-indigo-200 shrink-0"
            >
              📋 Request Client Info Template
            </Button>
          </div>

          {step === 'paste' ? (
            /* STEP 1: PASTE UNSTRUCTURED TEXT */
            <div className="space-y-4 animate-fade-in">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                    Paste Unstructured Client Message / Notes *
                  </label>
                  <button
                    type="button"
                    onClick={() => setPastedText(SAMPLE_PASTE_TEXT)}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline"
                  >
                    Insert Sample WhatsApp Response
                  </button>
                </div>
                <textarea
                  rows={8}
                  placeholder="Paste WhatsApp chat messages, Instagram DMs, email threads, or raw intake notes here..."
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  className="w-full p-3.5 text-xs font-mono rounded-xl border border-slate-300 bg-white leading-relaxed focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-[11px] text-slate-600 space-y-1">
                <span className="font-semibold text-slate-800">💡 How it works:</span>
                <p>
                  Ctrl Room automatically parses full names, phone numbers, email addresses, company names, requested services, deadlines, and budgets.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  loading={extracting}
                  onClick={handleExtract}
                  icon={<Sparkles size={16} className="fill-current" />}
                  className="font-bold"
                >
                  ✨ Extract Client Information
                </Button>
              </div>
            </div>
          ) : step === 'review' ? (
            /* STEP 2: REVIEW & EDIT FORM */
            <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in">
              {/* Duplicate Warning Card */}
              {duplicateClient && (
                <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-2">
                  <div className="flex items-start gap-2 text-amber-900">
                    <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider">
                        Possible Duplicate Client Detected!
                      </h4>
                      <p className="text-xs text-amber-800 mt-0.5">
                        A client with matching contact details already exists:
                      </p>
                      <div className="mt-1 font-semibold text-xs text-amber-950 bg-amber-100/60 p-2 rounded-lg border border-amber-200">
                        {duplicateClient.fullName} • {duplicateClient.email || 'No email'} • {duplicateClient.phone || 'No phone'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      icon={<Eye size={13} />}
                      onClick={() => {
                        handleClose()
                        router.push(`/clients/${duplicateClient.id}`)
                      }}
                      className="bg-white border-amber-300 text-amber-900 hover:bg-amber-100"
                    >
                      View Existing Client
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      onClick={() => setIgnoreDuplicate(true)}
                      className={ignoreDuplicate ? 'bg-amber-700 text-white' : ''}
                    >
                      {ignoreDuplicate ? '✓ Continuation Allowed' : 'Continue Anyway'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Client Profile Section */}
              <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <User size={14} className="text-indigo-600" />
                  Client Profile Information
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Full Name *
                    </label>
                    <Input
                      placeholder="e.g. Ama Mensah"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Company / Business Name
                    </label>
                    <Input
                      placeholder="e.g. Apex Marketing"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Email Address
                    </label>
                    <Input
                      type="email"
                      placeholder="ama@company.com"
                      value={email}
                      onChange={(e) => handleEmailChange(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Phone Number / WhatsApp
                    </label>
                    <Input
                      placeholder="024XXXXXXX"
                      value={phone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Extracted Service & Notes Section */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Service Requested
                    </label>
                    <Input
                      placeholder="e.g. Wedding Photography"
                      value={serviceRequested}
                      onChange={(e) => setServiceRequested(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Event Date / Deadline
                    </label>
                    <Input
                      placeholder="e.g. December 20, 2026"
                      value={eventDate || preferredDeadline}
                      onChange={(e) => setEventDate(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Client Notes & Conversation Summary
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Notes extracted from client intake..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
                  />
                </div>
              </div>

              {/* PART 4: OPTIONAL INITIAL JOB TOGGLE */}
              <div className="p-4 bg-indigo-50/70 rounded-xl border border-indigo-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderPlus size={16} className="text-indigo-600" />
                    <span className="text-xs font-bold text-indigo-950">
                      Create Initial Job / Project for this Client?
                    </span>
                  </div>
                  <div className="flex bg-white p-0.5 rounded-lg border border-indigo-200 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setCreateInitialJob(false)}
                      className={`px-3 py-1 rounded-md transition-all ${
                        !createInitialJob
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Create Client Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateInitialJob(true)}
                      className={`px-3 py-1 rounded-md transition-all ${
                        createInitialJob
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      + Create Initial Job
                    </button>
                  </div>
                </div>

                {createInitialJob && (
                  <div className="pt-2 space-y-3 border-t border-indigo-100 text-xs animate-fade-in">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-800 block mb-1">
                        Initial Job Title *
                      </label>
                      <Input
                        placeholder="e.g. Wedding Photography Service"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        required={createInitialJob}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-800 block mb-1">
                          Total Budget / Price (GHS)
                        </label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={jobAmount}
                          onChange={(e) => setJobAmount(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-800 block mb-1">
                          Deposit / Amount Paid (GHS)
                        </label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={jobAmountPaid}
                          onChange={(e) => setJobAmountPaid(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col-reverse sm:flex-row justify-between gap-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep('paste')}
                  icon={<RotateCcw size={14} />}
                >
                  Clear & Re-paste
                </Button>

                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={submitting}
                    icon={<User size={16} />}
                  >
                    {createInitialJob ? 'Create Client & Initial Job' : 'Create Client'}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            /* STEP 3: SUCCESS VIEW */
            <div className="space-y-5 text-center animate-fade-in py-4">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 size={32} />
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Client Created Successfully!
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Record established for{' '}
                  <span className="font-semibold text-slate-800">{createdResult?.clientName}</span>
                </p>
              </div>

              {createdResult?.invoiceNumber && (
                <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-200 text-xs">
                  <span className="text-indigo-700 font-medium">
                    Initial Job & Invoice Created:{' '}
                  </span>
                  <span className="font-mono font-bold text-indigo-900">
                    {createdResult.invoiceNumber}
                  </span>
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    handleClose()
                    if (createdResult?.clientId) {
                      router.push(`/clients/${createdResult.clientId}`)
                    }
                  }}
                >
                  View Client Profile
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleReset}
                  icon={<Plus size={16} />}
                >
                  Add Another Client
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Embedded Request Client Info Modal */}
      <RequestClientInfoModal
        isOpen={showRequestInfoModal}
        onClose={() => setShowRequestInfoModal(false)}
      />
    </>
  )
}
