import { NextResponse } from 'next/server'

/**
 * Proxies to backend /health. Use this to verify:
 * 1. Backend is up (http://15.206.213.150/docs)
 * 2. Frontend server can reach the backend (NEXT_PUBLIC_API_BASE_URL)
 */
const getBackendBase = () =>
  (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
const pathPrefix = (process.env.NEXT_PUBLIC_API_PATH_PREFIX || '').replace(/\/$/, '')

export async function GET() {
  const base = getBackendBase()
  const url = `${base}${pathPrefix ? `/${pathPrefix}` : ''}/health`
  try {
    const res = await fetch(url, { cache: 'no-store' })
    const text = await res.text()
    const data = text ? (() => { try { return JSON.parse(text) } catch { return { raw: text } } })() : {}
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, backend: url, status: res.status, body: data },
        { status: 502 }
      )
    }
    return NextResponse.json({ ok: true, backend: url, ...data })
  } catch (err) {
    console.error('[api/health]', err)
    return NextResponse.json(
      {
        ok: false,
        backend: url,
        error: 'Failed to reach backend',
        details: String(err),
      },
      { status: 502 }
    )
  }
}
