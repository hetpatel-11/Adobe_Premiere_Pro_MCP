import { useEffect, useRef } from "react"
import {
  ShaderFitOptions,
  ShaderMount,
  defaultObjectSizing,
  getShaderColorFromString,
  meshGradientFragmentShader,
} from "@paper-design/shaders"

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"

const MESH_COLORS = ["#020807", "#04322c", "#0f766e", "#5eead4", "#99f6e4"]

export function ShaderBackdrop() {
  const hostRef = useRef<HTMLDivElement>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const colors = MESH_COLORS.map((color) => getShaderColorFromString(color))
    const mount = new ShaderMount(
      host,
      meshGradientFragmentShader,
      {
        u_colors: colors,
        u_colorsCount: colors.length,
        u_distortion: 0.86,
        u_swirl: 0.42,
        u_grainMixer: 0.28,
        u_grainOverlay: 0.2,
        u_fit: ShaderFitOptions.cover,
        u_scale: defaultObjectSizing.scale,
        u_rotation: 0,
        u_originX: 0.5,
        u_originY: 0.5,
        u_offsetX: 0,
        u_offsetY: 0,
        u_worldWidth: 0,
        u_worldHeight: 0,
      },
      undefined,
      reduced ? 0 : 0.14,
      0,
      1,
      1920 * 1080,
    )

    return () => mount.dispose()
  }, [reduced])

  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
      <div ref={hostRef} className="absolute inset-0" />
      <div className="absolute inset-0 bg-linear-to-b from-background/10 via-background/35 to-background/92" />
    </div>
  )
}
