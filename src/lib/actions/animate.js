/**
 * Entrance animations, as Svelte actions.
 *
 * Deliberately scoped to containers and static lists. Anything inside a
 * `dndzone` is off limits: svelte-dnd-action and `animate:flip` already own
 * those elements' transforms, and a second library writing to the same
 * property mid-drag makes cards jump.
 *
 * Every animation here is an entrance only. Nothing loops, so the board never
 * moves while you are trying to read or drag it.
 */

import { gsap } from "gsap";

/** The OS-level "stop moving things" preference. */
function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Fade and lift an element in on mount.
 *
 * @param {HTMLElement} node
 * @param {{y?: number, duration?: number, delay?: number}} [options]
 */
export function reveal(node, options = {}) {
  if (prefersReducedMotion()) return {};

  const { y = 12, duration = 0.45, delay = 0 } = options;
  const tween = gsap.fromTo(
    node,
    { opacity: 0, y },
    { opacity: 1, y: 0, duration, delay, ease: "power2.out", clearProps: "transform" }
  );

  return {
    destroy() {
      // Leaving a tween running against a removed node leaks the ticker callback
      tween.kill();
    },
  };
}

/**
 * Stagger an element's direct children in.
 *
 * Reads the children once on mount. It is an entrance effect, not a live
 * binding, so items added later simply appear - which is what you want when
 * someone creates a task and expects to see it immediately.
 *
 * @param {HTMLElement} node
 * @param {{y?: number, duration?: number, stagger?: number, delay?: number}} [options]
 */
export function staggerChildren(node, options = {}) {
  if (prefersReducedMotion()) return {};

  const { y = 10, duration = 0.4, stagger = 0.045, delay = 0 } = options;
  const children = Array.from(node.children);
  if (children.length === 0) return {};

  const tween = gsap.fromTo(
    children,
    { opacity: 0, y },
    {
      opacity: 1,
      y: 0,
      duration,
      delay,
      stagger,
      ease: "power2.out",
      // Without this the children keep an inline transform, which breaks
      // position:sticky and any later drag maths
      clearProps: "transform",
    }
  );

  return {
    destroy() {
      tween.kill();
    },
  };
}
