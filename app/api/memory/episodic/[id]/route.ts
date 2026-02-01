import { NextRequest, NextResponse } from 'next/server'

const getBackendBase = () =>
  (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
const pathPrefix = (process.env.NEXT_PUBLIC_API_PATH_PREFIX || '').replace(/\/$/, '')

function backendUrl(id: string) {
  const base = getBackendBase()
  return `${base}${pathPrefix ? `/${pathPrefix}` : ''}/memory/episodic/${id}`
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = backendUrl(id)
  try {
    const res = await fetch(url, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    return NextResponse.json(data)
  } catch (err) {
    console.error('[api/memory/episodic DELETE]', err)
    return NextResponse.json(
      { error: 'Failed to reach backend', details: String(err) },
      { status: 502 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = backendUrl(id)
  try {
    const body = await request.json()
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    return NextResponse.json(data)
  } catch (err) {
    console.error('[api/memory/episodic PATCH]', err)
    return NextResponse.json(
      { error: 'Failed to reach backend', details: String(err) },
      { status: 502 }
    )
  }
}
