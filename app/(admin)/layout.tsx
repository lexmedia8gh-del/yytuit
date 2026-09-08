'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { useAuth } from '@/lib/hooks/useAuth'
import { PageLoader } from '@/components/ui/Spinner'

export const dynamic = 'force-dynamic'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  // Show loader while checking auth
  if (loading || !user) {
    return <PageLoader />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <TopBar onMenuClick={() => setSidebarOpen(true)} />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 max-w-screen-2xl mx-auto page-enter">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
