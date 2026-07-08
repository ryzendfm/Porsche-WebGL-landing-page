import { useRef, useEffect, useMemo, useState, Component } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment, useProgress } from "@react-three/drei";
import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import cameraPath from "./camera-path.json";
import "./CarScene.css";
import { SmoothCursor } from "@/registry/magicui/smooth-cursor";
import { CustomScrollbar } from "./CustomScrollbar";

gsap.registerPlugin(ScrollTrigger);

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.warn("ErrorBoundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

// Total scroll distance across the whole page, in viewport-heights.
// 10 beats: hero hold + introduction + 5 camera sections + 2 held interludes
// (heritage, quote) + closer. The hero holds still on camera 1; the dedicated
// introduction beat carries the camera 1 -> camera 2 move.
const TOTAL_VH = 1000;

// True when the OS asks for reduced motion. Read once at module load; the site
// isn't expected to toggle this mid-session, and it keeps the guard cheap.
const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Advance one full section (the sections rest exactly one viewport-height apart
// on the 1/9 snap grid). Called by the hero "Begin" button; the scroll snap in
// useScrollProgress then settles the intro section into place.
function scrollToNextSection() {
  if (typeof window === "undefined") return;
  window.scrollTo({
    top: window.scrollY + window.innerHeight,
    behavior: prefersReducedMotion ? "auto" : "smooth",
  });
}

// Return to the top of the story — used by the closer's "Build Yours" CTA, which
// is the last section and has nowhere further to advance.
function scrollToTop() {
  if (typeof window === "undefined") return;
  window.scrollTo({
    top: 0,
    behavior: prefersReducedMotion ? "auto" : "smooth",
  });
}


function useScrollProgress() {
  const progress = useRef(0);

  useEffect(() => {
    const st = ScrollTrigger.create({
      trigger: "#scroll-track",
      start: "top top",
      end: "bottom bottom",
      scrub: 1.2, // Smooth scrubbing so progress eases toward the scroll target.
      // Snap so scrolling always comes to rest with exactly one 100vh section
      // filling the screen — which means the camera settles on that section's
      // locked keyframe. There are SECTION_COUNT sections, so the snap grid is
      // every 1/(SECTION_COUNT-1) of progress (progress 0 = section 0 at top,
      // progress 1 = last section at top).
      snap: {
        snapTo: 1 / (SECTION_COUNT - 1),
        duration: { min: 0.25, max: 0.6 }, // ease to the lock, don't teleport
        delay: 0.06,
        ease: "power2.inOut",
      },
      onUpdate: (self) => {
        // Ref only — consumers (camera loop, HUD) read this inside their own
        // requestAnimationFrame loops. We deliberately do NOT trigger a React
        // re-render here: doing so on every scroll frame re-rendered the whole
        // scene tree 60x/sec and fought the WebGL render loop, causing shutter.
        progress.current = self.progress;
      },
    });
    return () => st.kill();
  }, []);

  return progress;
}

// Porsche classic palette. Only these hexes are used to paint the body-panel
// material (the GLB material literally named "paint" — see the mesh map; only
// the outer shell uses it, so glass/rubber/trim stay untouched).
const PAINT = {
  red: "#D11B1F", // Guards Red
  white: "#F8F9FA", // White
  black: "#000000", // Black
  yellow: "#FCD116", // Racing Yellow
  blue: "#00A3E0", // Mexico Blue
  slate: "#717A94", // Slate Grey
};

// Per-section body colour, indexed exactly like SECTION_CAM below. As you scroll
// the paint cross-fades between adjacent sections (smootherstep, same 1/9 grid
// as the camera), so the story reads: white through the intro, Guards Red at the
// silhouette, Mexico Blue at the detail, back to white through grip, Slate Grey
// under the aero beat, and white again at the closer. Edit any row to retune.
const SECTION_COLOR = [
  PAINT.white, // 0 hero
  PAINT.white, // 1 intro
  PAINT.white, // 2 crest
  PAINT.red, //   3 silhouette
  PAINT.blue, //  4 detail
  PAINT.white, // 5 grip
  PAINT.white, // 6 heritage (opaque — transition to slate happens here)
  PAINT.slate, // 7 aero
  PAINT.slate, // 8 quote
  PAINT.white, // 9 closer
];

// Subtle "look at me" reaction: the car tilts a few degrees toward the cursor,
// damped so it eases in/out instead of tracking 1:1. Amplitudes are small on
// purpose so this reads as life, not as fighting the scripted camera path.
function CarModel({ progress }) {
  const { scene } = useGLTF("/porsche-optimized.glb");
  const ref = useRef();
  const baseY = useRef(0);

  // Collect every material named "paint" once. The GLB shares a single paint
  // material across all body panels, but traversing and de-duping keeps this
  // correct even if the export splits it. useMemo keys off the loaded scene so
  // it only re-runs if the model itself changes.
  const paintMaterials = useMemo(() => {
    const found = new Set();
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (m && m.name === "paint") found.add(m);
      });
    });
    return [...found];
  }, [scene]);

  // Precompute a THREE.Color per section, plus a reusable scratch target so the
  // per-frame lerp allocates nothing.
  const sectionColors = useMemo(
    () => SECTION_COLOR.map((hex) => new THREE.Color(hex)),
    []
  );
  const targetColor = useMemo(() => new THREE.Color(SECTION_COLOR[0]), []);

  useFrame((state, delta) => {
    if (!ref.current) return;

    // --- Scroll-driven paint colour. Same 1/9 section grid + smootherstep as
    // the camera path, so the paint settles exactly when a section locks. ---
    const t = THREE.MathUtils.clamp(progress.current, 0, 1);
    const spans = SECTION_COUNT - 1;
    const scaled = t * spans;
    const i = Math.min(Math.floor(scaled), spans - 1);
    const local = smootherstep(scaled - i);
    targetColor.lerpColors(sectionColors[i], sectionColors[i + 1], local);
    // Critically-damped follow so the colour eases in even if scroll jumps.
    const colorAlpha = 1 - Math.exp(-6 * delta);
    paintMaterials.forEach((m) => m.color.lerp(targetColor, colorAlpha));

    // --- Pointer tilt. state.pointer is normalized to [-1, 1], (0,0) center.
    const targetY = baseY.current + state.pointer.x * 0.18;
    const targetX = -state.pointer.y * 0.06;
    // damp() is frame-rate independent (uses delta), so it feels identical at
    // 60 / 120 / 144 Hz and can't stutter from a dropped frame.
    ref.current.rotation.y = THREE.MathUtils.damp(ref.current.rotation.y, targetY, 4, delta);
    ref.current.rotation.x = THREE.MathUtils.damp(ref.current.rotation.x, targetX, 4, delta);
  });

  return <primitive ref={ref} object={scene} />;
}

// Smootherstep (Ken Perlin's 6t^5-15t^4+10t^3). Zero velocity AND zero
// acceleration at both ends — the key to killing the switch shutter.
const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Beat boundaries in scroll-progress space, and the camera-segment value each
// boundary maps to. Two extra fractional stops (4.85, 5.85) hold the camera
// nearly still under the heritage/quote overlays. This lives at module scope so
// the arrays aren't rebuilt every frame.
// The page is 10 equal 100vh sections. Scroll SNAPS to each section (see the
// snap config in useScrollProgress), so the viewer always comes to rest with
// exactly one section filling the screen — and the camera settled on that
// section's locked keyframe.
//
// A 1000vh track scrolled in a 100vh viewport has 900vh of travel, so section
// k rests at scroll progress k/9 (progress 0 = section 0 at top, progress 1 =
// section 9 at top). The snap grid and these beats therefore BOTH step by 1/9.
//
// SECTION_CAM is the camera each section locks onto when it's the one on
// screen. Integer values are exact camera keyframes; the .5 values belong to
// the three opaque sections (intro, heritage, quote) whose backgrounds hide the
// car mid-move, so the awkward long swings happen out of sight. The visible
// transitions (crest->silhouette->detail->grip, aero->closer) are the short,
// clean spline moves between adjacent keyframes.
const SECTION_COUNT = 10;
const SECTION_CAM = [
  0,   // 0 hero       lock camera 1
  0,   // 1 intro      HOLD camera 1 — hero span has zero movement; the whole
       //              1 -> 2 move happens next span, behind the opaque intro,
       //              and settles exactly as the crest scrolls in.
  1,   // 2 crest      lock camera 2
  2,   // 3 silhouette lock camera 3
  3,   // 4 detail     lock camera 4
  4,   // 5 grip       lock camera 5
  4.5, // 6 heritage   (opaque) mid-move 5 -> 6
  5,   // 7 aero       lock camera 6
  5.5, // 8 quote      (opaque) mid-move 6 -> 7
  6,   // 9 closer     lock camera 7
];

// Maps overall scroll progress (0-1) to a camera-segment float in [0, 6].
// Progress is divided into (SECTION_COUNT - 1) equal spans on the 1/9 grid; each
// span interpolates between two adjacent SECTION_CAM values with smootherstep,
// so segment-velocity is zero at every snap point — the camera arrives and
// leaves each locked section with no velocity kick (C1-continuous throughout).
function cameraProgressCurve(t) {
  const spans = SECTION_COUNT - 1; // 9
  if (t <= 0) return SECTION_CAM[0];
  if (t >= 1) return SECTION_CAM[spans];

  const scaled = t * spans; // 0 .. 9
  const i = Math.min(Math.floor(scaled), spans - 1);
  const local = smootherstep(scaled - i);
  return SECTION_CAM[i] + (SECTION_CAM[i + 1] - SECTION_CAM[i]) * local;
}

function ScrollCamera({ progress }) {
  const { camera } = useThree();

  const keyframes = useMemo(
    () =>
      cameraPath.keyframes.map((k) => ({
        position: new THREE.Vector3(k.position.x, k.position.y, k.position.z),
        quaternion: new THREE.Quaternion(
          k.quaternion.x,
          k.quaternion.y,
          k.quaternion.z,
          k.quaternion.w
        ),
      })),
    []
  );

  // Centripetal Catmull-Rom keeps the flight path smooth without the wide
  // overshoot that uniform/chordal splines produce on sharp turns — that
  // overshoot was what threw the camera "off the track" between viewpoints.
  const positionSpline = useMemo(() => {
    const points = keyframes.map((k) => k.position);
    return new THREE.CatmullRomCurve3(points, false, "centripetal");
  }, [keyframes]);

  const targetPos = useMemo(() => new THREE.Vector3(), []);
  const targetQuat = useMemo(() => new THREE.Quaternion(), []);

  useFrame((_, delta) => {
    const camProgress = cameraProgressCurve(progress.current);
    const segments = keyframes.length - 1;

    // CatmullRomCurve3.getPoint(u) internally does floor(u*segments) + frac,
    // so sampling at u = camProgress/segments puts the position on the exact
    // same clock as the rotation below. Position and aim now stay locked
    // together instead of drifting apart within a segment (the old code eased
    // rotation with an extra smoothstep the position never saw).
    const u = THREE.MathUtils.clamp(camProgress / segments, 0, 1);
    positionSpline.getPoint(u, targetPos);

    // Rotation shares camProgress directly — no second easing pass. Because
    // camProgress is already smootherstep-eased per beat, angular velocity is
    // continuous through the keyframes.
    const segment = Math.min(Math.floor(camProgress), segments - 1);
    const localT = camProgress - segment;
    targetQuat.slerpQuaternions(
      keyframes[segment].quaternion,
      keyframes[Math.min(segment + 1, segments)].quaternion,
      localT
    );

    // Final critically-damped follow. This absorbs any residual micro-jitter
    // coming out of GSAP's scrub without adding lag you can feel. The alpha is
    // derived from delta so the smoothing is identical at any refresh rate.
    const alpha = 1 - Math.exp(-9 * delta);
    camera.position.lerp(targetPos, alpha);
    camera.quaternion.slerp(targetQuat, alpha);
  });

  return null;
}

// Branded loading screen shown while the ~18MB GLB downloads/parses. drei's
// useProgress is a zustand store that lives OUTSIDE the Canvas, so we can read
// load state here without mounting anything into the 3D tree. On completion we
// fade the overlay out with GSAP, then unmount it so it never eats pointer
// events over the finished scene.
function Preloader() {
  const { active } = useProgress();
  const ref = useRef(null);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    if (active) return; // still loading — keep the overlay up
    if (prefersReducedMotion) {
      setMounted(false);
      return;
    }
    const tween = gsap.to(ref.current, {
      autoAlpha: 0,
      duration: 0.6,
      delay: 0.15,
      ease: "power2.out",
      onComplete: () => setMounted(false),
    });
    return () => tween.kill();
  }, [active]);

  if (!mounted) return null;

  return (
    <div className="preloader" ref={ref}>
      <div className="loader">
        <div className="box1"></div>
        <div className="box2"></div>
        <div className="box3"></div>
      </div>
    </div>
  );
}



// Scroll-reveal entrance for each block of copy. gsap.from animates FROM an
// offset/transparent state TOWARD each element's natural resting position, using
// only transform + opacity — so the final layout is byte-identical to before and
// the car-clearing positions are untouched. Separate ScrollTriggers on
// .beat-inner elements; the camera trigger (#scroll-track) is independent.
function useScrollReveals() {
  useEffect(() => {
    if (prefersReducedMotion) return;
    const ctx = gsap.context(() => {
      const blocks = gsap.utils.toArray(
        ".beat-inner, .intro-inner, .interlude, .heritage-copy"
      );
      blocks.forEach((el) => {
        gsap.from(el, {
          y: 26,
          autoAlpha: 0,
          duration: 0.8,
          ease: "power2.out",
          scrollTrigger: {
            trigger: el,
            start: "top 82%",
            toggleActions: "play none none reverse",
          },
        });
      });
    });
    return () => ctx.revert();
  }, []);
}

// The canvas background is a single fixed layer shared by every section, so we
// can't just paint .hero-beat orange (it would cover the car). Instead we tint
// the shared background and fade it back to the normal cream as the hero scrolls
// away. Reads progress.current in an rAF loop (no scene re-renders) and writes
// the color straight to the DOM node's style, mirroring the HUD/cursor pattern.
const HERO_BG = [187, 38, 73]; // #BB2649 crimson, hero only
const BASE_BG = [231, 228, 222]; // --surface cream

function useHeroBackdrop(progress, ref) {
  useEffect(() => {
    let raf;
    const update = () => {
      // Hero rests at progress 0; the opaque intro covers the screen by ~1/9.
      // Fade the orange out across that first span so the crest returns to cream.
      const t = progress.current;
      const k = Math.min(1, t / (1 / 9)); // 0 at hero -> 1 by intro
      const mix = (a, b) => Math.round(a + (b - a) * k);
      if (ref.current) {
        ref.current.style.background = `rgb(${mix(HERO_BG[0], BASE_BG[0])}, ${mix(
          HERO_BG[1],
          BASE_BG[1]
        )}, ${mix(HERO_BG[2], BASE_BG[2])})`;
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [progress, ref]);
}

export default function CarScene() {
  const progress = useScrollProgress();
  useScrollReveals();
  const canvasLayerRef = useRef(null);
  useHeroBackdrop(progress, canvasLayerRef);

  useEffect(() => {
    let activeTween = null;

    const handleKeyDown = (e) => {
      if (
        document.activeElement &&
        (document.activeElement.tagName === "INPUT" ||
          document.activeElement.tagName === "TEXTAREA" ||
          document.activeElement.isContentEditable)
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();

        const isShift = e.shiftKey;
        const currentScroll = window.scrollY;
        const vh = window.innerHeight;
        
        let targetIndex;
        if (isShift) {
          // Go to previous section
          targetIndex = Math.max(0, Math.ceil(currentScroll / vh) - 1);
        } else {
          // Go to next section
          targetIndex = Math.min(SECTION_COUNT - 1, Math.floor(currentScroll / vh) + 1);
        }

        const targetY = targetIndex * vh;

        if (activeTween) {
          activeTween.kill();
        }

        const scrollObj = { y: currentScroll };
        activeTween = gsap.to(scrollObj, {
          y: targetY,
          duration: prefersReducedMotion ? 0 : 1.1, // Smooth, not too fast, not too slow
          ease: "power2.inOut",
          onUpdate: () => {
            window.scrollTo(0, scrollObj.y);
          },
          onComplete: () => {
            activeTween = null;
          }
        });
      }
    };

    const killActiveTween = () => {
      if (activeTween) {
        activeTween.kill();
        activeTween = null;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", killActiveTween, { passive: true });
    window.addEventListener("touchmove", killActiveTween, { passive: true });
    window.addEventListener("mousedown", killActiveTween, { passive: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", killActiveTween);
      window.removeEventListener("touchmove", killActiveTween);
      window.removeEventListener("mousedown", killActiveTween);
      if (activeTween) {
        activeTween.kill();
      }
    };
  }, []);


  return (
    <>
      <Preloader />
      <SmoothCursor />
      <CustomScrollbar />
      <div className="cinematic-layer" aria-hidden="true" />

      <div className="canvas-layer" ref={canvasLayerRef}>
        <Canvas
          camera={{ fov: Math.round((0.3996 * 180) / Math.PI) }}
          gl={{ antialias: true }}
        >
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 8, 5]} intensity={1.2} />
          <ErrorBoundary fallback={null}>
            <Environment files="/potsdamer_platz_1k.hdr" />
          </ErrorBoundary>
          <CarModel progress={progress} />
          <ScrollCamera progress={progress} />
        </Canvas>
      </div>

      <div id="scroll-track" style={{ position: "relative", zIndex: 1, height: `${TOTAL_VH}vh` }}>
        <Beat
          className="hero-beat"
          extra={
            <>
              <div className="hero-brand-title">PORSCHE</div>
              <PorscheMarquee />
            </>
          }
        >
          <span className="eyebrow">The 911</span>
          <h1 className="display-xl">
            SIX DECADES.
            <br />
            ONE SILHOUETTE.
          </h1>
          <PillButton onClick={scrollToNextSection}>Begin</PillButton>
        </Beat>

        {/* Introduction — the camera 1 -> camera 2 move plays out across this
            beat, settling exactly as the crest content below scrolls in. */}
        <div className="beat intro-beat">
          <div className="intro-inner">
            <span className="eyebrow intro-label">Introduction</span>
            <p className="intro-lead">
              Developed directly from six decades of motorsport, the 911 was the
              first of its kind. And with its numerous championship victories in
              endurance racing, it quickly became the most iconic silhouette in
              the sports-car line-up.
            </p>
          </div>
        </div>

        <Beat className="crest-beat">
          <span className="eyebrow">The Crest</span>
          <h2 className="display-lg">
            Stuttgart's crest has sat on this hood since the first prototype left
            the workshop. It has never needed a redesign.
          </h2>
        </Beat>

        <Beat align="right" className="silhouette-beat">
          <span className="eyebrow">Silhouette</span>
          <h2 className="display-lg">Proportion is the whole argument.</h2>
          <p className="body-md narrow">
            The short front overhang and long rear haunch aren't styling — they're a
            direct read of what sits over the rear axle. Form follows the engine.
          </p>
        </Beat>

        <Beat className="detail-beat">
          <span className="eyebrow">Detail</span>
          <h2 className="display-lg">Every line reads at speed.</h2>
          <dl className="stat-row">
            <div>
              <dt>3.2s</dt>
              <dd>0–100 km/h</dd>
            </div>
            <div>
              <dt>308</dt>
              <dd>km/h top speed</dd>
            </div>
            <div>
              <dt>450</dt>
              <dd>hp, twin-turbo flat-six</dd>
            </div>
          </dl>
        </Beat>

        <Beat className="grip-beat">
          <span className="eyebrow">Grip</span>
          <h2 className="display-lg">The contact patch is the whole point.</h2>
          <p className="body-md narrow">
            Six-piston front calipers, adaptive suspension damping, staggered
            20"/21" forged wheels front to rear.
          </p>
        </Beat>

        {/* Held interlude — dark overlay, camera barely moves underneath.
            Racing-heritage feature: BMW-style bold left heading + Learn More
            over vintage racing footage (public/vintage-car.gif), with the
            vintage production still as a low, textured backdrop. */}
        <div className="beat interlude-slot">
          <section className="heritage-feature">
            <div className="heritage-copy">
              <span className="eyebrow eyebrow--on-dark">Racing Heritage</span>
              <h2 className="heritage-title">
                The road car and the race car share a block. What wins at Le Mans
                on Sunday ships to the showroom by spring.
              </h2>
              <PillButton onClick={scrollToNextSection}>Learn More</PillButton>
            </div>
            <figure className="heritage-footage">
              <img
                src="/vintage-car.gif"
                alt="Vintage Porsche race cars battling on a period circuit"
                loading="lazy"
              />
            </figure>
          </section>
        </div>

        <Beat align="right" className="aero-beat">
          <span className="eyebrow">Aerodynamics</span>
          <h2 className="display-lg">The wing knows when to work.</h2>
          <p className="body-md narrow">
            Active rear spoiler deploys above 90 km/h. Louvred engine cover pulls
            heat straight off the flat-six underneath it.
          </p>
        </Beat>

        {/* Held interlude — quote card */}
        <div className="beat interlude-slot">
          <div className="interlude">
            <span className="quote-mark">&ldquo;</span>
            <p className="quote-text">
              It isn't about transportation. It's about the road disappearing
              underneath you, on purpose.
            </p>
            <span className="quote-attr">— Total 911, 1996</span>
          </div>
        </div>

        <Beat cta className="closer-beat">
          <h2 className="display-xl">STILL THE ANSWER.</h2>
          <p className="body-lg">Configure your 911.</p>
          <PillButton onClick={scrollToTop}>Build Yours</PillButton>
        </Beat>
      </div>

      <footer className="site-footer">
        <div className="footer-brand">Concept Build</div>
        <div className="footer-col">
          <span>Home</span>
          <span>Models</span>
          <span>About</span>
        </div>
        <div className="footer-col">
          <span>Instagram</span>
          <span>Behance</span>
        </div>
        <div className="footer-col developer-info">
          <span>
            developed by <span className="porsche-text">RYZ</span>
          </span>
          <a
            href="https://github.com/ryzendfm"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
            aria-label="GitHub Profile"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="currentColor"
              className="github-icon"
            >
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </a>
        </div>
        <p className="footer-disclaimer">
          Fan-made concept for portfolio purposes. Not affiliated with or endorsed
          by Porsche AG. 3D model reproduction by Sooriyaa.
        </p>
      </footer>
    </>
  );
}

// Shared pill button — white capsule with a circular arrow badge, matching the
// Racing Heritage "Learn More" affordance. Every CTA on the site uses this so
// the button language is consistent. The arrow slides right on hover (see CSS).
function PillButton({ children, onClick, className = "" }) {
  return (
    <button className={`button ${className}`} onClick={onClick}>
      <span className="button__icon-wrapper">
        <svg viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="button__icon-svg" width={14}>
          <path d="M13.376 11.552l-.264-10.44-10.44-.24.024 2.28 6.96-.048L.2 12.56l1.488 1.488 9.432-9.432-.048 6.912 2.304.024z" fill="currentColor" />
        </svg>
        <svg viewBox="0 0 14 15" fill="none" width={14} xmlns="http://www.w3.org/2000/svg" className="button__icon-svg button__icon-svg--copy">
          <path d="M13.376 11.552l-.264-10.44-10.44-.24.024 2.28 6.96-.048L.2 12.56l1.488 1.488 9.432-9.432-.048 6.912 2.304.024z" fill="currentColor" />
        </svg>
      </span>
      {children}
    </button>
  );
}

function Beat({ align = "left", children, quiet = false, cta = false, className = "", extra = null }) {
  return (
    <div
      className={`beat ${align === "right" ? "align-right" : align === "center" ? "align-center" : ""} ${
        quiet ? "is-quiet" : ""
      } ${cta ? "is-cta" : ""} ${className}`}
      style={{ height: "100vh" }}
    >
      <div className="beat-inner">{children}</div>
      {/* Sibling of .beat-inner so the scroll-reveal transform on .beat-inner
          doesn't become this element's positioning anchor. */}
      {extra}
    </div>
  );
}

// Horizontal "PORSCHE" marquee pinned to the bottom of the hero. Two identical
// track copies scroll left via CSS keyframes; when the first has moved a full
// width, the second sits exactly where it started, so the loop is seamless.
function PorscheMarquee() {
  const word = "911 Carrera 4S";
  const items = Array.from({ length: 8 }, (_, i) => i);
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {items.map((i) => (
          <span className="marquee-word" key={`a${i}`}>
            {word}
            <span className="marquee-dot">•</span>
          </span>
        ))}
      </div>
      <div className="marquee-track" aria-hidden="true">
        {items.map((i) => (
          <span className="marquee-word" key={`b${i}`}>
            {word}
            <span className="marquee-dot">•</span>
          </span>
        ))}
      </div>
    </div>
  );
}

useGLTF.preload("/porsche-optimized.glb");
