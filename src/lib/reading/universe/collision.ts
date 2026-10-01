// A deterministic teaching event, not BESIII event data or a decay generator.
// GeV, c = 1. Daughter four-momenta conserve energy and momentum at each vertex.
export type Vec3 = [number, number, number];
export interface FourMomentum {
  e: number;
  p: Vec3;
}
export const COLLISION_PERIOD = 19.2;
// Teaching-clock units at default 4×: fast injection, slower decay, a full fade.
export const COLLISION_TIMING = {
  beamEnd: 1.6,
  flashEnd: 2,
  pairEnd: 5.2,
  decayEnd: 14,
  fadeStart: 14.8,
  clearStart: 18.8,
} as const;
export const EVENT_STAGE_TIMES = [
  COLLISION_TIMING.beamEnd / 2,
  (COLLISION_TIMING.beamEnd + COLLISION_TIMING.flashEnd) / 2,
  (COLLISION_TIMING.flashEnd + COLLISION_TIMING.pairEnd) / 2,
  (COLLISION_TIMING.pairEnd + COLLISION_TIMING.decayEnd) / 2,
  (COLLISION_TIMING.decayEnd + COLLISION_TIMING.fadeStart) / 2,
] as const;
const dot = (a: Vec3, b: Vec3) => a.reduce((s, x, i) => s + x * b[i], 0);
const scale = (a: Vec3, s: number): Vec3 => a.map((x) => x * s) as Vec3;
const add = (a: Vec3, b: Vec3): Vec3 => a.map((x, i) => x + b[i]) as Vec3;
const unit = (a: Vec3) => scale(a, 1 / Math.sqrt(dot(a, a)));
export function boost(q: FourMomentum, parent: FourMomentum): FourMomentum {
  const beta = scale(parent.p, 1 / parent.e),
    b2 = dot(beta, beta);
  if (b2 === 0) return { e: q.e, p: [...q.p] };
  const gamma = 1 / Math.sqrt(1 - b2),
    bp = dot(beta, q.p);
  return { e: gamma * (q.e + bp), p: add(q.p, scale(beta, ((gamma - 1) * bp) / b2 + gamma * q.e)) };
}
function twoBody(
  parentMass: number,
  firstMass: number,
  secondMass: number,
  direction: Vec3
): [FourMomentum, FourMomentum] {
  const magnitude =
    Math.sqrt(
      (parentMass ** 2 - (firstMass + secondMass) ** 2) *
        (parentMass ** 2 - (firstMass - secondMass) ** 2)
    ) /
    (2 * parentMass);
  const p = scale(unit(direction), magnitude);
  return [
    { e: Math.sqrt(firstMass ** 2 + magnitude ** 2), p },
    { e: Math.sqrt(secondMass ** 2 + magnitude ** 2), p: scale(p, -1) },
  ];
}
export function teachingEvent() {
  const mass = 1.86484,
    mK = 0.493677,
    mpi = 0.13957,
    me = 0.000511;
  const energy = 3.773 / 2;
  const d: FourMomentum = {
    e: energy,
    p: scale(unit([1, 0.45, 0.28]), Math.sqrt(energy ** 2 - mass ** 2)),
  };
  const dbar: FourMomentum = { e: energy, p: scale(d.p, -1) };
  // X is the inclusive hadronic system in D0 → X e+ νe; its composition is unspecified.
  // mX is a teaching invariant mass for the system, not a specific particle mass.
  const mX = 1.1,
    mq = 0.45;
  const [hadronicSystem, q] = twoBody(mass, mX, mq, [-0.4, 0.8, 0.8]);
  const [ep, nu] = twoBody(mq, me, 0, [-0.8, -0.8, 0.8]);
  const [tagK, tagPi] = twoBody(mass, mK, mpi, [-0.7, -0.3, 0.2]);
  return {
    d,
    dbar,
    signal: {
      positron: boost(boost(ep, q), d),
      neutrino: boost(boost(nu, q), d),
      hadronicSystem: boost(hadronicSystem, d),
    },
    tag: [boost(tagK, dbar), boost(tagPi, dbar)],
  };
}
export function collisionPhase(time: number) {
  const remainder = time % COLLISION_PERIOD;
  const t = remainder < 0 ? remainder + COLLISION_PERIOD : remainder;
  const { beamEnd, flashEnd, pairEnd, decayEnd, fadeStart, clearStart } = COLLISION_TIMING;
  const fade = Math.max(0, Math.min(1, (t - fadeStart) / (clearStart - fadeStart)));
  return {
    time: t,
    stage: t < beamEnd ? 0 : t < flashEnd ? 1 : t < pairEnd ? 2 : t < decayEnd ? 3 : 4,
    clearing: t >= clearStart,
    opacity: 1 - fade * fade * (3 - 2 * fade),
  };
}
// Straight flight-direction illustration, deliberately omitting magnetic deflection.
export function flightTrack(origin: Vec3, p: Vec3, distance: number): Vec3 {
  const magnitude = Math.hypot(...p);
  return magnitude === 0 ? [...origin] : add(origin, scale(p, distance / magnitude));
}
