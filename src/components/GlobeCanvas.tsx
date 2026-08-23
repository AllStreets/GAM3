'use client'

import { useEffect, useRef } from 'react'
import { GlobeEngine } from '@/engine/GlobeEngine'

export default function GlobeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new GlobeEngine(canvas)
    engine.start()
    return () => engine.dispose()
  }, [])

  return (
    <div className="fixed inset-0">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
