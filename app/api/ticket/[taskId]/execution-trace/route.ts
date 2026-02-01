import { NextRequest, NextResponse } from 'next/server'

const getBackendBase = () =>
  (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
const pathPrefix = (process.env.NEXT_PUBLIC_API_PATH_PREFIX || '').replace(/\/$/, '')

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params
  if (!taskId) {
    return NextResponse.json({ error: 'taskId required' }, { status: 400 })
  }
  const base = getBackendBase()
  const url = `${base}${pathPrefix ? `/${pathPrefix}` : ''}/ticket/${encodeURIComponent(taskId)}/execution-trace`
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
    console.error('[api/ticket/execution-trace]', url, err)
    return NextResponse.json(
      { error: 'Failed to reach backend', backend: url, details: String(err) },
      { status: 502 }
    )
  }
}
