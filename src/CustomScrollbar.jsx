import { useEffect, useState } from "react";

export function CustomScrollbar() {
  const [thumbTop, setThumbTop] = useState(0);
  const [thumbHeight, setThumbHeight] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let hideTimer;

    const update = () => {
      const doc = document.documentElement;
      const scrollTop = window.scrollY;
      const totalHeight = doc.scrollHeight - doc.clientHeight;
      const viewportRatio = doc.clientHeight / doc.scrollHeight;

      const thumbH = Math.max(viewportRatio * 100, 4); // min 4vh
      const maxTop = 100 - thumbH;
      const top = totalHeight > 0 ? (scrollTop / totalHeight) * maxTop : 0;

      setThumbHeight(thumbH);
      setThumbTop(top);
      setVisible(true);

      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setVisible(false), 1200);
    };

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      clearTimeout(hideTimer);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "3px",
        height: "100vh",
        zIndex: 9998,
        pointerEvents: "none",
        background: "transparent",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: 0,
          width: "3px",
          top: `${thumbTop}%`,
          height: `${thumbHeight}vh`,
          background: "#ffffff",
          borderRadius: "999px",
          boxShadow: "0 0 6px rgba(255,255,255,0.4)",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.4s ease, top 0.05s linear",
        }}
      />
    </div>
  );
}
