'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-[#05070E] text-white">
          <div className="text-center">
            <h2 className="text-4xl font-bold mb-4">Something went wrong!</h2>
            <button
              onClick={() => reset()}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
