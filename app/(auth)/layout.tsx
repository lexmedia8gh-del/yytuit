import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In | Ctrl Room',
  description: 'Enterprise workspace and operations portal.',
}

export const dynamic = 'force-dynamic'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen w-full bg-[#05070E] text-slate-100 flex flex-col justify-center items-center relative overflow-hidden selection:bg-indigo-500/30 selection:text-indigo-200">
      {children}
    </div>
  )
}

