'use client'

export const dynamic = 'force-dynamic'

import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle2,
  AlertCircle,
  FileText,
  Printer,
  ArrowLeft,
  Download,
  ShieldCheck,
  Building2,
  Calendar,
  CreditCard,
  ExternalLink,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import {
  COLLECTIONS,
  getDocuments,
} from '@/lib/firebase/firestore'
import type { ClientLink, Invoice, Project, Delivery } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { BrandingProvider, useBranding } from '@/lib/contexts/BrandingContext'
import toast from 'react-hot-toast'
import {
  PageEnter,
  FadeIn,
  SlideUp,
  CardReveal,
  StaggerContainer,
  StaggerItem,
  SuccessReveal,
} from '@/components/ui/Transitions'

function ThankYouPageInner() {
  const params = useParams()
  const searchParams = useSearchParams()
  const token = params?.token as string
  const refQuery = searchParams.get('reference') || searchParams.get('trxref')

  const { branding } = useBranding()
  const [loading, setLoading] = useState(true)
  const [linkData, setLinkData] = useState<ClientLink | null>(null)
  const [invoiceData, setInvoiceData] = useState<Invoice | null>(null)
  const [projectData, setProjectData] = useState<Project | null>(null)
  const [deliveryData, setDeliveryData] = useState<Delivery | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verifiedRef, setVerifiedRef] = useState<string>(refQuery || '')

  useEffect(() => {
    if (!token) return

    const loadData = async () => {
      setLoading(true)
      try {
        const allLinks = await getDocuments<ClientLink>(COLLECTIONS.CLIENT_LINKS)
        const match = allLinks.find((l) => l.token === token)

        if (!match) {
          setLoading(false)
          return
        }

        setLinkData(match)
        if (match.paystackReference) {
          setVerifiedRef(match.paystackReference)
        }

        // If there is an invoice, fetch it
        if (match.invoiceId) {
          const allInvoices = await getDocuments<Invoice>(COLLECTIONS.INVOICES)
          const inv = allInvoices.find((i) => i.id === match.invoiceId)
          if (inv) {
            setInvoiceData(inv)
          }
        }

        // If there is a project, fetch it
        const projectId = match.projectId
        if (projectId) {
          const allProjects = await getDocuments<Project>(COLLECTIONS.PROJECTS)
          const proj = allProjects.find((p) => p.id === projectId)
          if (proj) {
            setProjectData(proj)
          }

          // Check for any delivery files associated with this project
          const allDeliveries = await getDocuments<Delivery>(COLLECTIONS.DELIVERIES)
          const delivery = allDeliveries.find(
            (d) => d.projectId === projectId && (d.isReleased || d.status === 'Ready for Delivery')
          )
          if (delivery) {
            setDeliveryData(delivery)
          }
        }

        // If a reference was passed in the URL and the link is not marked paid, verify it
        if (refQuery && match.status !== 'Paid') {
          setIsVerifying(true)
          try {
            const res = await fetch(
              `/api/paystack/verify?reference=${encodeURIComponent(refQuery)}&token=${encodeURIComponent(token)}`
            )
            const verifyRes = await res.json()
            if (verifyRes.status === 'success') {
              setVerifiedRef(refQuery)
              setLinkData((prev) => (prev ? { ...prev, status: 'Paid', paystackReference: refQuery } : prev))
              toast.success('Payment verified successfully!')
            }
          } catch (vErr) {
            console.warn('[Thank You] Auto-verification warning:', vErr)
          } finally {
            setIsVerifying(false)
          }
        }
      } catch (err) {
        console.error('[Thank You] Error loading payment records:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [token, refQuery])

  if (loading || isVerifying) {
    return (
      <PageEnter>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <FadeIn className="text-center space-y-4">
            <Spinner size="lg" className="mx-auto text-blue-600" />
            <p className="text-sm text-gray-500 font-medium">Verifying and preparing your receipt...</p>
          </FadeIn>
        </div>
      </PageEnter>
    )
  }

  const amountPaid = linkData?.amount || invoiceData?.amountPaid || 0
  const invoiceNum = linkData?.invoiceNumber || invoiceData?.invoiceNumber || 'LXM-INV'
  const clientName = linkData?.clientName || 'Valued Client'

  return (
    <PageEnter>
      <div className="min-h-screen bg-gray-50/90 flex flex-col justify-between p-4 sm:p-6 font-sans">
        <div className="max-w-xl mx-auto w-full space-y-6 my-auto py-8">

          {/* Branding Header */}
          <SlideUp delay={0.05} className="text-center space-y-2">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.businessName}
                className="h-10 mx-auto object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <div className="flex items-center justify-center gap-2">
                <span className="font-display font-extrabold text-2xl tracking-tight text-gray-900">
                  {branding.businessName || 'LEXMEDIA'}
                </span>
              </div>
            )}
          </SlideUp>

          {/* Confirmation Receipt Card */}
          <CardReveal delay={0.1}>
            <Card className="p-6 sm:p-8 space-y-6 shadow-modal border-border bg-white rounded-3xl">
              
              {/* Green Checkmark & Heading */}
              <SuccessReveal className="text-center space-y-3 pb-2 border-b border-border">
                <div className="w-16 h-16 rounded-full bg-success-50 text-success-600 flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 size={36} />
                </div>
                <Badge variant="success" size="md">
                  Payment Confirmed
                </Badge>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  Thank You, {clientName}!
                </h1>
                <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">
                  Your payment has been securely received and recorded. A receipt has been generated for your records.
                </p>
              </SuccessReveal>

              {/* Receipt Summary Grid */}
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-2xl p-5 border border-border space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted">Invoice Number</span>
                    <span className="font-mono font-bold text-gray-900">{invoiceNum}</span>
                  </div>
                  {projectData?.name && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted">Project</span>
                      <span className="font-semibold text-gray-900">{projectData.name}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted">Amount Paid</span>
                    <span className="text-base font-bold text-success-700">
                      {formatCurrency(amountPaid)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted">Payment Method</span>
                    <span className="font-medium text-gray-800 flex items-center gap-1.5">
                      <CreditCard size={14} className="text-gray-400" />
                      Paystack Secure Checkout
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-200/60">
                    <span className="text-muted">Transaction Reference</span>
                    <code className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-700">
                      {verifiedRef || 'LXM_CONFIRMED'}
                    </code>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted">Status</span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-700 bg-success-50 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-success-600" />
                      Settled
                    </span>
                  </div>
                </div>

                {/* Optional Deliverables Link if unlocked */}
                {deliveryData && (
                  <div className="bg-blue-50/60 rounded-2xl p-4 border border-blue-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-blue-900">Project Deliverables Ready</p>
                      <p className="text-xs text-blue-700">Your final files and deliverables are available.</p>
                    </div>
                    <Link
                      href={`/delivery/${encodeURIComponent(deliveryData.accessToken)}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0 shadow-sm"
                    >
                      <Download size={14} />
                      Access Files
                    </Link>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 text-white hover:bg-black transition-colors shadow-sm"
                >
                  <Printer size={16} />
                  Print Receipt
                </button>
                <Link
                  href={`/pay/${encodeURIComponent(token)}`}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <ArrowLeft size={16} />
                  Back to Invoice
                </Link>
              </div>

              {/* Trust & Security Badge */}
              <div className="flex items-center justify-center gap-2 text-xs text-gray-400 pt-2">
                <ShieldCheck size={14} className="text-success-600" />
                <span>Verified Transaction • 256-bit Encrypted</span>
              </div>
            </Card>
          </CardReveal>
        </div>

        {/* Footer */}
        <FadeIn delay={0.3}>
          <footer className="text-center py-4 text-xs" style={{ color: branding.mutedTextColor || '#6B7280' }}>
            © {new Date().getFullYear()} {branding.businessName || 'Lexmedia Agency'}. All rights reserved.
          </footer>
        </FadeIn>
      </div>
    </PageEnter>
  )
}

export default function ThankYouPage() {
  return (
    <BrandingProvider>
      <ThankYouPageInner />
    </BrandingProvider>
  )
}
