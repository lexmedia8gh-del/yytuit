import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#05070E] text-white">
      <div className="text-center">
        <h2 className="text-4xl font-bold mb-4">404 - Not Found</h2>
        <p className="text-slate-400 mb-8">Could not find requested resource</p>
        <Link 
          href="/"
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium transition-colors"
        >
          Return Home
        </Link>
      </div>
    </div>
  )
}
