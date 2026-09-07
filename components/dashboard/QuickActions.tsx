'use client'

import React from 'react'
import Link from 'next/link'
import { UserPlus, FolderPlus, FileText, Link2, Zap, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'

interface QuickAction {
  label: string
  href?: string
  onClick?: () => void
  icon: React.ComponentType<any>
  color: string
  bg: string
  description: string
  highlight?: boolean
}

interface QuickActionsProps {
  onOpenQuickJob?: () => void
}

export function QuickActions({ onOpenQuickJob }: QuickActionsProps) {
  const actions: QuickAction[] = [
    {
      label: 'Quick Job',
      href: '/projects?action=quickjob',
      onClick: onOpenQuickJob,
      icon: Zap,
      color: 'text-amber-600',
      bg: 'bg-amber-50 border border-amber-200/60',
      description: 'Fast custom service & one-off job logging',
      highlight: true,
    },
    {
      label: 'New Client',
      href: '/clients?action=new',
      icon: UserPlus,
      color: 'text-success-600',
      bg: 'bg-success-50',
      description: 'Add a new client to the system',
    },
    {
      label: 'New Project',
      href: '/projects?action=new',
      icon: FolderPlus,
      color: 'text-accent-600',
      bg: 'bg-accent-50',
      description: 'Create and track a new project',
    },
    {
      label: 'Create Invoice',
      href: '/invoices?action=new',
      icon: FileText,
      color: 'text-warning-600',
      bg: 'bg-warning-50',
      description: 'Issue a new invoice to a client',
    },
    {
      label: 'Generate Link',
      href: '/links?action=new',
      icon: Link2,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      description: 'Create a shareable client payment link',
    },
  ]

  return (
    <Card padding="none">
      <div className="p-4 sm:p-5 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Quick Actions</h3>
        <p className="text-xs text-gray-500 mt-0.5">Common tasks at your fingertips</p>
      </div>
      <div className="p-4 grid grid-cols-2 gap-2.5">
        {actions.map((action) => {
          const Icon = action.icon

          if (action.onClick) {
            return (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className={`flex flex-col items-start gap-2.5 p-3 rounded-lg border text-left transition-all duration-150 group ${
                  action.highlight
                    ? 'border-amber-300/80 bg-amber-50/40 hover:bg-amber-100/50 hover:border-amber-400'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/60'
                }`}
              >
                <div className={`p-2 rounded-md ${action.bg}`}>
                  <Icon size={16} className={action.color} />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-bold text-gray-900 group-hover:text-amber-700 transition-colors">
                      {action.label}
                    </p>
                    <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-amber-500 text-white">
                      Fast
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                    {action.description}
                  </p>
                </div>
              </button>
            )
          }

          return (
            <Link
              key={action.href}
              href={action.href!}
              className={`flex flex-col items-start gap-2.5 p-3 rounded-lg border transition-all duration-150 group ${
                action.highlight
                  ? 'border-amber-300/80 bg-amber-50/40 hover:bg-amber-100/50 hover:border-amber-400'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/60'
              }`}
            >
              <div className={`p-2 rounded-md ${action.bg}`}>
                <Icon size={16} className={action.color} />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <p className="text-xs font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                    {action.label}
                  </p>
                  {action.highlight && (
                    <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-amber-500 text-white">
                      Fast
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                  {action.description}
                </p>
              </div>
            </Link>
          )
        })}
      </div>
    </Card>
  )
}
