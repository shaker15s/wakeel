import { NextResponse } from 'next/server'

/** Shared response helpers for all Wakeel API routes. */

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

/** Wrap a route body: any uncaught failure becomes a 500 {error} response. */
export async function handleRoute(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn()
  } catch (error) {
    console.error('[wakeel/api] unhandled route error:', error)
    return jsonError(500, 'Internal server error.')
  }
}
