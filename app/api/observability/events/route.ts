import { NextRequest, NextResponse } from 'next/server'

const getBackendBase = () =>
  (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
const pathPrefix = (process.env.NEXT_PUBLIC_API_PATH_PREFIX || '').replace(/\/$/, '')

export async function GET(request: NextRequest) {
  const base = getBackendBase()
  const { searchParams } = new URL(request.url)
  const query = searchParams.toString()
  const url = `${base}${pathPrefix ? `/${pathPrefix}` : ''}/observability/events${query ? `?${query}` : ''}`
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, cache: 'no-store' })
    const text = await res.text()
    const data = text ? (() => { try { return JSON.parse(text) } catch { return { raw: text } } })() : {}
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Backend error', backend: url, status: res.status, ...data },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
      )
    }
    return NextResponse.json(data)
  } catch (err) {
    console.error('[api/observability/events]', url, err)
    return NextResponse.json(
      { error: 'Failed to reach backend', backend: url, details: String(err) },
      { status: 502 }
    )
  }
}
