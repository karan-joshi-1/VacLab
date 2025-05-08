export default function Loading() {
  return (
    <main className="flex min-h-screen justify-center items-center">
      <div className="flex flex-col items-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-300"></div>
        <p className="text-gray-400">Loading...</p>
      </div>
    </main>
  )
}