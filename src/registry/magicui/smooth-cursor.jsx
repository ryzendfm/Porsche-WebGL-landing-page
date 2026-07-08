import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export function SmoothCursor({
  cursor,
  springConfig = { damping: 35, stiffness: 200, mass: 0.8 }
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Track mouse coordinates
  const mouseX = useMotionValue(-100);
  const mouseY = useMotionValue(-100);

  // Apply spring physics for trailing/smooth feel
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);

  // Animate cursor scale on hover
  const scale = useSpring(1, { damping: 25, stiffness: 100 });

  // Reactively drive scale when hover state changes
  useEffect(() => {
    scale.set(isHovered ? 1.7 : 1);
  }, [isHovered, scale]);

  useEffect(() => {
    // Disable custom cursor on touch devices (pointer: coarse)
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (coarse) return;

    setIsVisible(true);
    document.body.classList.add("has-custom-cursor");

    const handleMouseMove = (e) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };

    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseEnter = () => setIsVisible(true);

    const handlePointerOver = (e) => {
      const interactive = e.target.closest("button, a, .btn-primary, .btn-learn, .button");
      setIsHovered(!!interactive);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("pointerover", handlePointerOver);
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("mouseenter", handleMouseEnter);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("pointerover", handlePointerOver);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("mouseenter", handleMouseEnter);
      document.body.classList.remove("has-custom-cursor");
    };
  }, [mouseX, mouseY]);

  if (!isVisible) return null;

  return (
    <motion.div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        x: smoothX,
        y: smoothY,
        scale: scale,
        translateX: "-50%",
        translateY: "-50%",
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      {cursor ? (
        cursor
      ) : (
        <div
          className="smooth-cursor-navigate"
          style={{
            width: "14px",
            height: "14px",
            background: "transparent",
            backdropFilter: "invert(1) saturate(0) blur(6px)",
            WebkitBackdropFilter: "invert(1) saturate(0) blur(6px)",
            maskImage: "url('/media/navigate.png')",
            WebkitMaskImage: "url('/media/navigate.png')",
            maskSize: "contain",
            WebkitMaskSize: "contain",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskPosition: "center",
          }}
        />
      )}
    </motion.div>
  );
}
