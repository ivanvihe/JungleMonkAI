import { Variants } from 'framer-motion';

export type AnimationPreset = Variants;

export const fadeInUp: AnimationPreset = {
  initial: { opacity: 0, translateY: 12 },
  animate: {
    opacity: 1,
    translateY: 0,
    transition: {
      duration: 0.24,
      ease: [0.24, 0.82, 0.25, 1],
    },
  },
  exit: {
    opacity: 0,
    translateY: -8,
    transition: {
      duration: 0.18,
      ease: [0.4, 0, 1, 1],
    },
  },
};

export const scaleIn: AnimationPreset = {
  initial: { opacity: 0, scale: 0.98 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.26,
      ease: [0.2, 0.8, 0.2, 1],
    },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    transition: {
      duration: 0.18,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

export const staggerChildren = (stagger = 0.06): AnimationPreset => ({
  initial: {},
  animate: {
    transition: {
      staggerChildren: stagger,
    },
  },
});

export const slideInFromRight: AnimationPreset = {
  initial: { opacity: 0, translateX: 32 },
  animate: {
    opacity: 1,
    translateX: 0,
    transition: {
      duration: 0.28,
      ease: [0.2, 0.8, 0.2, 1],
    },
  },
  exit: {
    opacity: 0,
    translateX: 24,
    transition: {
      duration: 0.2,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};
