'use client'

import React, { useState, useEffect } from 'react'
import {
  X,
  MessageSquare,
  Copy,
  ExternalLink,
  Edit3,
  RotateCcw,
  Save,
  Check,
  Phone,
  Send,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import {
  COLLECTIONS,
  getDocument,
  setDocument,
} from '@/lib/firebase/firestore'
import { formatWhatsAppNumber, copyToClipboard } from '@/lib/utils'
import toast from 'react-hot-toast'

export const DEFAULT_CLIENT_INFO_TEMPLATE = `Hello! 👋

Thank you for your interest in our services.

To help us create your client profile and assist you properly, please provide the following information:

1. Full Name:
2. Phone Number:
3. Email Address:
4. Business/Company Name (if applicable):
5. Service You Need:
6. Brief Description of Your Request/Project:
7. Preferred Date or Deadline:
8. Budget (if available):

Once you send these details, I will be able to proceed with your request.

Thank you! 🙏`

interface RequestClientInfoModalProps {
  isOpen: boolean
  onClose: () => void
  initialPhone?: string
  initialClientName?: string
}

export function RequestClientInfoModal({
  isOpen,
  onClose,
  initialPhone = '',
  initialClientName = '',
}: RequestClientInfoModalProps) {
  const [phoneNumber, setPhoneNumber] = useState(initialPhone)
  const [messageText, setMessageText] = useState(DEFAULT_CLIENT_INFO_TEMPLATE)
  const [isEditingDraft, setIsEditingDraft] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [copied, setCopied] = useState(false)

  // Sync initial phone if provided
  useEffect(() => {
    if (initialPhone) {
      setPhoneNumber(initialPhone)
    }
  }, [initialPhone])

  // Load custom template from Firestore / localStorage
  useEffect(() => {
    if (isOpen) {
      // 1. Try LocalStorage
      const local = typeof window !== 'undefined' ? localStorage.getItem('lexmedia_client_info_template') : null
      if (local) {
        setMessageText(local)
      }

      // 2. Try Firestore
      getDocument<{ content: string }>(COLLECTIONS.SETTINGS, 'client_template')
        .then((doc) => {
          if (doc && doc.content) {
            setMessageText(doc.content)
            if (typeof window !== 'undefined') {
              localStorage.setItem('lexmedia_client_info_template', doc.content)
            }
          }
        })
        .catch((err) => {
          console.warn('Error fetching client_template setting:', err)
        })
    }
  }, [isOpen])

  // Save current template as default
  const handleSaveTemplate = async () => {
    setSavingTemplate(true)
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('lexmedia_client_info_template', messageText)
      }
      await setDocument(COLLECTIONS.SETTINGS, 'client_template', {
        content: messageText,
        updatedAt: new Date().toISOString(),
      }, true)
      toast.success('Template saved as default!')
    } catch (err) {
      console.error('Error saving template:', err)
      toast.error('Failed to save template setting.')
    } finally {
      setSavingTemplate(false)
    }
  }

  // Restore factory default template
  const handleRestoreDefault = () => {
    setMessageText(DEFAULT_CLIENT_INFO_TEMPLATE)
    if (typeof window !== 'undefined') {
      localStorage.removeItem('lexmedia_client_info_template')
    }
    toast.success('Restored default template text.')
  }

  // Copy to clipboard
  const handleCopyMessage = () => {
    copyToClipboard(messageText)
    setCopied(true)
    toast.success('Message copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  }

  // Open in WhatsApp
  const handleOpenWhatsApp = () => {
    const cleanPhone = formatWhatsAppNumber(phoneNumber)
    const encoded = encodeURIComponent(messageText)

    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`

    window.open(waUrl, '_blank')
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="📋 Request Client Information"
      size="lg"
    >
      <div className="space-y-4">
        {/* Recipient Phone Field */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-1.5">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Phone size={14} className="text-indigo-600" />
            WhatsApp Recipient Phone Number
          </label>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. 0241234567 or +233241234567 (Optional)"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="bg-white text-xs"
            />
            {phoneNumber && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPhoneNumber('')}
                className="text-slate-400 hover:text-slate-600"
              >
                Clear
              </Button>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            If provided, WhatsApp will open directly with this number. Leave blank to pick recipient in WhatsApp.
          </p>
        </div>

        {/* Draft & Template Editor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <FileText size={14} className="text-indigo-600" />
              Message Draft & Template Wording
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsEditingDraft(!isEditingDraft)}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 transition-colors"
              >
                <Edit3 size={12} />
                {isEditingDraft ? 'View Preview' : 'Edit Draft'}
              </button>
            </div>
          </div>

          <textarea
            rows={10}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            className="w-full p-3.5 text-xs font-sans rounded-xl border border-slate-300 bg-white leading-relaxed focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
            placeholder="Type or edit client information request wording..."
          />
        </div>

        {/* Template Customization Settings Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={handleSaveTemplate}
              loading={savingTemplate}
              icon={<Save size={13} className="text-indigo-600" />}
            >
              Save as Default Template
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleRestoreDefault}
              icon={<RotateCcw size={13} className="text-slate-500" />}
            >
              Restore Default
            </Button>
          </div>

          <span className="text-[11px] text-slate-400">
            Custom template stays saved across sessions
          </span>
        </div>

        {/* Primary Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3 border-t border-slate-200/80">
          <Button
            type="button"
            variant="outline"
            onClick={handleCopyMessage}
            icon={copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
            className="w-full justify-center"
          >
            {copied ? 'Copied to Clipboard' : '📋 Copy Message'}
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsEditingDraft(true)}
            icon={<Edit3 size={16} />}
            className="w-full justify-center"
          >
            📝 Edit Draft
          </Button>

          <Button
            type="button"
            variant="accent"
            onClick={handleOpenWhatsApp}
            icon={<MessageSquare size={16} className="text-white fill-current" />}
            className="w-full justify-center font-bold"
          >
            💬 Open in WhatsApp
          </Button>
        </div>
      </div>
    </Modal>
  )
}
