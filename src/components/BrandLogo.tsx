'use client';

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';

const brandCharacters = ['尤', '婉', '玲'] as const;
const beadColors = [
  '#b86f5d', '#66799a', '#95a36f', '#b08b55',
  '#81718f', '#aa7888', '#6e8f88', '#b86f5d',
  '#66799a', '#95a36f', '#b08b55', '#81718f',
  '#aa7888', '#6e8f88', '#b86f5d', '#66799a',
];

interface LetterMotion {
  x: number;
  y: number;
  rotation: number;
  velocityX: number;
  velocityY: number;
  rotationVelocity: number;
  targetX: number;
  targetY: number;
  targetRotation: number;
}

const createLetterMotion = (): LetterMotion => ({
  x: 0,
  y: 0,
  rotation: 0,
  velocityX: 0,
  velocityY: 0,
  rotationVelocity: 0,
  targetX: 0,
  targetY: 0,
  targetRotation: 0,
});

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);

export default function BrandLogo() {
  const brandRef = useRef<HTMLElement | null>(null);
  const letterRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const motionsRef = useRef<LetterMotion[]>(brandCharacters.map(createLetterMotion));
  const frameRef = useRef<number | null>(null);
  const startAnimationRef = useRef<() => void>(() => undefined);
  const pointerActiveRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const moodTimerRef = useRef<number | null>(null);
  const lastPointerRef = useRef({ x: 0, y: 0, time: 0 });

  const setMood = useCallback((mood: 'resting' | 'shy' | 'startled') => {
    if (brandRef.current) brandRef.current.dataset.mood = mood;
  }, []);

  const sendLettersHome = useCallback(() => {
    motionsRef.current.forEach(motion => {
      motion.targetX = 0;
      motion.targetY = 0;
      motion.targetRotation = 0;
    });
    setMood('resting');
    startAnimationRef.current();
  }, [setMood]);

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateReducedMotion = () => {
      reducedMotionRef.current = reducedMotionQuery.matches;
      if (!reducedMotionQuery.matches) return;

      motionsRef.current = brandCharacters.map(createLetterMotion);
      letterRefs.current.forEach(letter => {
        if (letter) letter.style.transform = '';
      });
      setMood('resting');
    };

    updateReducedMotion();
    reducedMotionQuery.addEventListener('change', updateReducedMotion);

    const animate = () => {
      let shouldContinue = pointerActiveRef.current;

      motionsRef.current.forEach((motion, index) => {
        const letter = letterRefs.current[index];
        if (!letter) return;

        motion.velocityX = (motion.velocityX + (motion.targetX - motion.x) * 0.115) * 0.76;
        motion.velocityY = (motion.velocityY + (motion.targetY - motion.y) * 0.115) * 0.76;
        motion.rotationVelocity = (
          motion.rotationVelocity + (motion.targetRotation - motion.rotation) * 0.13
        ) * 0.72;

        motion.x += motion.velocityX;
        motion.y += motion.velocityY;
        motion.rotation += motion.rotationVelocity;

        const isMoving = Math.abs(motion.x) > 0.04
          || Math.abs(motion.y) > 0.04
          || Math.abs(motion.rotation) > 0.03
          || Math.abs(motion.velocityX) > 0.03
          || Math.abs(motion.velocityY) > 0.03
          || Math.abs(motion.rotationVelocity) > 0.02;

        if (!isMoving && !pointerActiveRef.current) {
          motion.x = 0;
          motion.y = 0;
          motion.rotation = 0;
          motion.velocityX = 0;
          motion.velocityY = 0;
          motion.rotationVelocity = 0;
          letter.style.transform = '';
          return;
        }

        shouldContinue = true;
        letter.style.transform = `translate3d(${motion.x.toFixed(2)}px, ${motion.y.toFixed(2)}px, 0) rotate(${motion.rotation.toFixed(2)}deg)`;
      });

      frameRef.current = shouldContinue ? window.requestAnimationFrame(animate) : null;
    };

    startAnimationRef.current = () => {
      if (frameRef.current === null && !reducedMotionRef.current) {
        frameRef.current = window.requestAnimationFrame(animate);
      }
    };

    return () => {
      reducedMotionQuery.removeEventListener('change', updateReducedMotion);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      if (moodTimerRef.current !== null) window.clearTimeout(moodTimerRef.current);
    };
  }, [setMood]);

  const moveAwayFromPointer = useCallback((clientX: number, clientY: number, pointerSpeed: number) => {
    if (reducedMotionRef.current) return;

    const now = performance.now();
    const radius = 145 + Math.min(pointerSpeed * 24, 55);
    let affectedLetterCount = 0;

    letterRefs.current.forEach((letter, index) => {
      if (!letter) return;

      const motion = motionsRef.current[index];
      const rect = letter.getBoundingClientRect();
      const baseCenterX = rect.left + rect.width / 2 - motion.x;
      const baseCenterY = rect.top + rect.height / 2 - motion.y;
      let deltaX = baseCenterX - clientX;
      let deltaY = baseCenterY - clientY;
      let distance = Math.hypot(deltaX, deltaY);

      if (distance < 0.5) {
        const fallbackAngle = now / 240 + index * (Math.PI * 2 / brandCharacters.length);
        deltaX = Math.cos(fallbackAngle);
        deltaY = Math.sin(fallbackAngle);
        distance = 1;
      }

      if (distance >= radius) {
        motion.targetX = 0;
        motion.targetY = 0;
        motion.targetRotation = 0;
        return;
      }

      affectedLetterCount += 1;
      const strength = 1 - distance / radius;
      const directionX = deltaX / distance;
      const directionY = deltaY / distance;
      const tangentWobble = Math.sin(now / 115 + index * 1.8) * 7 * strength;
      const speedBoost = Math.min(pointerSpeed * 11, 25);
      const horizontalDistance = 18 + strength * (30 + speedBoost);
      const verticalDistance = 10 + strength * (20 + speedBoost * 0.55);

      motion.targetX = clamp(
        directionX * horizontalDistance - directionY * tangentWobble,
        -50,
        50,
      );
      motion.targetY = clamp(
        directionY * verticalDistance + directionX * tangentWobble,
        -32,
        32,
      );
      motion.targetRotation = clamp(
        (directionX * 8 - directionY * 3) * strength + tangentWobble * 0.35,
        -11,
        11,
      );
    });

    setMood(affectedLetterCount > 0 ? 'shy' : 'resting');
    startAnimationRef.current();
  }, [setMood]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const currentTime = event.timeStamp || performance.now();
    const previousPointer = lastPointerRef.current;
    const elapsed = Math.max(12, currentTime - previousPointer.time);
    const pointerSpeed = previousPointer.time === 0
      ? 0
      : clamp(Math.hypot(event.clientX - previousPointer.x, event.clientY - previousPointer.y) / elapsed, 0, 3.5);

    lastPointerRef.current = { x: event.clientX, y: event.clientY, time: currentTime };
    pointerActiveRef.current = true;
    moveAwayFromPointer(event.clientX, event.clientY, pointerSpeed);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (reducedMotionRef.current) return;

    pointerActiveRef.current = true;
    moveAwayFromPointer(event.clientX, event.clientY, 3.5);
    setMood('startled');

    motionsRef.current.forEach((motion, index) => {
      const fallbackDirection = index === 1 ? -1 : index - 1;
      motion.velocityX += Math.sign(motion.targetX || fallbackDirection || 1) * (5.5 + index);
      motion.velocityY += Math.sign(motion.targetY || -1) * (3.8 + index * 0.7);
      motion.rotationVelocity += (index - 1) * 1.8;
    });

    if (event.pointerType !== 'touch') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    if (moodTimerRef.current !== null) window.clearTimeout(moodTimerRef.current);
    moodTimerRef.current = window.setTimeout(() => {
      setMood(pointerActiveRef.current ? 'shy' : 'resting');
    }, 360);
    startAnimationRef.current();
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (event.pointerType !== 'touch') return;
    pointerActiveRef.current = false;
    sendLettersHome();
  };

  const handlePointerLeave = () => {
    pointerActiveRef.current = false;
    lastPointerRef.current.time = 0;
    sendLettersHome();
  };

  return (
    <header
      ref={brandRef}
      className="atelier-brand"
      data-mood="resting"
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerLeave}
      onPointerLeave={handlePointerLeave}
    >
      <div className="atelier-brand__beads" aria-hidden="true">
        {beadColors.map((color, index) => (
          <span key={`${color}-${index}`} style={{ backgroundColor: color }} />
        ))}
      </div>
      <div className="atelier-brand__wordmark">
        <h1 aria-label="尤婉玲">
          {brandCharacters.map((character, index) => (
            <span
              key={character}
              ref={element => { letterRefs.current[index] = element; }}
              className="atelier-brand__letter"
              aria-hidden="true"
            >
              <span className="atelier-brand__glyph">{character}</span>
            </span>
          ))}
        </h1>
        <div className="atelier-brand__rule" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </header>
  );
}
