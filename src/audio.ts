/**
 * 逻辑解题音效（Web Audio 合成，无外部资源）
 * - 落环：弦振拨弦（衰减正弦+低通）
 * - 排除：水滴涟漪（音高下落 + 噪声水花）
 * pitchStep：连拍数 n 对应的音高抬升（半音）
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const C =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    ctx = new C()
    master = ctx.createGain()
    master.gain.value = 0.28
    master.connect(ctx.destination)
  }
  return ctx
}

export function setMuted(m: boolean): void {
  muted = m
  if (master) master.gain.value = m ? 0 : 0.28
}

export function isMuted(): boolean {
  return muted
}

export function resumeAudio(): void {
  const c = ac()
  if (c && c.state === 'suspended') void c.resume()
}

/** 连拍数 n → 半音偏移（1=0, 2=+2, 3=+4 …） */
function semitoneForStreak(n: number): number {
  const k = Math.max(1, Math.min(n, 12)) - 1
  return k * 2
}

function mul(semi: number): number {
  return Math.pow(2, semi / 12)
}

/** 水滴：音高快速下落 + 轻微噪声水花 */
export function playDrop(streak = 1): void {
  const c = ac()
  if (!c || !master || muted) return
  const t = c.currentTime
  const k = mul(semitoneForStreak(streak))

  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(920 * k, t)
  osc.frequency.exponentialRampToValueAtTime(280 * k, t + 0.14)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.55, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
  osc.connect(g)
  g.connect(master)
  osc.start(t)
  osc.stop(t + 0.28)

  const noise = c.createBufferSource()
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.18), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  }
  noise.buffer = buf
  const hp = c.createBiquadFilter()
  hp.type = 'bandpass'
  hp.frequency.value = 1800 * k
  hp.Q.value = 0.8
  const ng = c.createGain()
  ng.gain.setValueAtTime(0.18, t)
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
  noise.connect(hp)
  hp.connect(ng)
  ng.connect(master)
  noise.start(t)
  noise.stop(t + 0.18)

  const echo = c.createOscillator()
  const eg = c.createGain()
  echo.type = 'sine'
  echo.frequency.setValueAtTime(640 * k, t + 0.06)
  echo.frequency.exponentialRampToValueAtTime(220 * k, t + 0.22)
  eg.gain.setValueAtTime(0.0001, t + 0.06)
  eg.gain.exponentialRampToValueAtTime(0.16, t + 0.08)
  eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
  echo.connect(eg)
  eg.connect(master)
  echo.start(t + 0.06)
  echo.stop(t + 0.32)
}

/**
 * 弦振拨弦
 * streak：连拍数，抬升音高
 */
export function playPluck(streak = 1, lengthRatio = 1): void {
  const c = ac()
  if (!c || !master || muted) return
  const t = c.currentTime
  const k = mul(semitoneForStreak(streak))

  const base = (520 / Math.max(0.6, Math.min(1.6, lengthRatio))) * k
  const partials = [
    { mul: 1, amp: 0.5, decay: 0.45 },
    { mul: 2.01, amp: 0.18, decay: 0.28 },
    { mul: 3.02, amp: 0.07, decay: 0.18 },
  ]

  const bus = c.createGain()
  bus.gain.value = 0.42
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(2200 * k, t)
  lp.frequency.exponentialRampToValueAtTime(700 * k, t + 0.35)
  bus.connect(lp)
  lp.connect(master)

  for (const p of partials) {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'triangle'
    o.frequency.value = base * p.mul
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(p.amp, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + p.decay + 0.15)
    o.connect(g)
    g.connect(bus)
    o.start(t)
    o.stop(t + p.decay + 0.2)
  }

  const click = c.createOscillator()
  const cg = c.createGain()
  click.type = 'square'
  click.frequency.value = 120 * k
  cg.gain.setValueAtTime(0.06, t)
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
  click.connect(cg)
  cg.connect(bus)
  click.start(t)
  click.stop(t + 0.05)
}

/** 根据边状态播放对应音效；streak 抬音高 */
export function playForEdge(onLoop: boolean, streak = 1, lengthRatio = 1): void {
  resumeAudio()
  if (onLoop) playPluck(streak, lengthRatio)
  else playDrop(streak)
}
