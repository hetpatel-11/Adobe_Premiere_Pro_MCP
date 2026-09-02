import { useEffect, useRef, useState } from "react"

import {
  FALLBACK_FORKS,
  FALLBACK_STARS,
  fetchRepoStats,
} from "@/lib/github"

import { usePrefersReducedMotion } from "./use-prefers-reduced-motion"

const POLL_MS = 45_000
const TICK_MS = 720
const SETTLE_TICKS = 3

function raceProgress(t: number) {
  const clamped = Math.min(1, Math.max(0, t))
  if (clamped < 0.72) {
    return 0.94 * (clamped / 0.72) ** 2.15
  }
  const rest = (clamped - 0.72) / 0.28
  return 0.94 + 0.06 * (1 - (1 - rest) ** 3)
}

function raceDuration(target: number) {
  return Math.min(2800, Math.max(1600, 1200 + target * 1.6))
}

function raceDestination(total: number, reduced: boolean) {
  if (reduced) return total
  return Math.max(0, total - SETTLE_TICKS)
}

export function useLiveStars() {
  const reduced = usePrefersReducedMotion()
  const [display, setDisplay] = useState(0)
  const [target, setTarget] = useState(FALLBACK_STARS)
  const [forks, setForks] = useState(FALLBACK_FORKS)
  const [phase, setPhase] = useState<"racing" | "live">("racing")
  const [ticked, setTicked] = useState(false)
  const displayRef = useRef(0)
  const targetRef = useRef(FALLBACK_STARS)
  const racingRef = useRef(true)

  useEffect(() => {
    let cancelled = false
    let raceFrame = 0
    let tickTimer = 0
    let pollTimer = 0
    let flashTimer = 0

    const show = (value: number) => {
      displayRef.current = value
      setDisplay(value)
    }

    const raceTo = (nextValue: number) => {
      racingRef.current = true
      setPhase("racing")
      const from = displayRef.current
      const start = performance.now()
      const duration = reduced ? 0 : raceDuration(nextValue)

      const step = (now: number) => {
        if (cancelled) return
        if (duration === 0) {
          show(nextValue)
          racingRef.current = false
          setPhase("live")
          return
        }
        const t = Math.min(1, (now - start) / duration)
        show(Math.round(from + (nextValue - from) * raceProgress(t)))
        if (t < 1) {
          raceFrame = requestAnimationFrame(step)
          return
        }
        show(nextValue)
        racingRef.current = false
        setPhase("live")
      }

      cancelAnimationFrame(raceFrame)
      raceFrame = requestAnimationFrame(step)
    }

    const applyTarget = (next: number) => {
      const previous = targetRef.current
      if (next < previous) return
      targetRef.current = next
      setTarget(next)
      if (!racingRef.current) return
      if (next === previous && displayRef.current > 0) return
      raceTo(raceDestination(next, reduced))
    }

    const pull = async () => {
      try {
        const stats = await fetchRepoStats()
        if (cancelled) return
        setForks(stats.forks)
        applyTarget(stats.stars)
      } catch {
        if (cancelled) return
        applyTarget(FALLBACK_STARS)
      }
    }

    raceTo(raceDestination(FALLBACK_STARS, reduced))
    void pull()
    pollTimer = window.setInterval(() => {
      void pull()
    }, POLL_MS)

    tickTimer = window.setInterval(() => {
      if (cancelled || racingRef.current) return
      if (displayRef.current >= targetRef.current) return
      show(displayRef.current + 1)
      setTicked(true)
      window.clearTimeout(flashTimer)
      flashTimer = window.setTimeout(() => {
        if (!cancelled) setTicked(false)
      }, 280)
    }, TICK_MS)

    return () => {
      cancelled = true
      cancelAnimationFrame(raceFrame)
      window.clearInterval(tickTimer)
      window.clearInterval(pollTimer)
      window.clearTimeout(flashTimer)
    }
  }, [reduced])

  return { display, target, forks, phase, ticked }
}
