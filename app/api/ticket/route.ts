import { NextRequest, NextResponse } from 'next/server'

const getBackendBase = () =>
  (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
const pathPrefix = (process.env.NEXT_PUBLIC_API_PATH_PREFIX || '').replace(/\/$/, '')

export async function POST(request: NextRequest) {
  const base = getBackendBase()
  const url = `${base}${pathPrefix ? `/${pathPrefix}` : ''}/ticket`
  try {
    const body = await request.json()
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    return NextResponse.json(data)
  } catch (err) {
    console.error('[api/ticket POST]', err)
    return NextResponse.json(
      { error: 'Failed to reach backend', details: String(err) },
      { status: 502 }
    )
  }
}
