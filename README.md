# Porsche 911 — 3D WebGL Landing Page

A premium, interactive 3D WebGL landing page showcasing the design and legacy of the iconic Porsche 911. Built with **React**, **Three.js (React Three Fiber)**, **GSAP**, and **Vite**.

![Porsche Landing Page Preview](https://raw.githubusercontent.com/ryzendfm/Porsche-WebGL-landing-page/main/media/pngwing.com.png)

## ✨ Features

- **Interactive 3D Stage**: Displays an optimized Porsche 911 3D model using `@react-three/fiber` and `@react-three/drei`.
- **Cinematic Camera Paths**: Smoothly interpolates the camera positions and quaternions using a Centripetal Catmull-Rom spline controlled by GSAP `ScrollTrigger`.
- **Dynamic Body Paint Color**: Seamlessly cross-fades the car body's panel color between Guards Red, Mexico Blue, Slate Grey, and classic White as you scroll through different storytelling sections.
- **Custom Smooth Cursor**: Responsive custom cursor driven by Framer Motion springs that expands (70% increase) dynamically when hovering over buttons.
- **Razor-Thin Floating Scrollbar**: Completely replaces standard browser scrollbars with a custom, floating white scrollbar thumb (3px wide) featuring a subtle glow. The track is fully transparent, and the scrollbar fades out automatically after 1.2s of inactivity.
- **Morphing Box Preloader**: A unique, loop-animated preloader consisting of three shifting boxes that morph together while the 18MB 3D model finishes downloading.
- **Vignette & Film Grain**: Fixed cinematic filter layer overlaying the layout to give the WebGL canvas a premium photographic feel.

---

## 🛠️ Tech Stack

- **Framework**: [React](https://react.dev/) + [Vite](https://vite.dev/)
- **3D Graphics**: [Three.js](https://threejs.org/) + [React Three Fiber](https://r3f.docs.pmnd.rs/) + [Drei](https://github.com/pmndrs/drei)
- **Animations**: [GSAP](https://gsap.com/) (GreenSock) + [ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/) + [Framer Motion](https://www.framer.com/motion/)
- **Styling**: Vanilla CSS

---

## 🚀 Getting Started

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) installed (v18+ recommended).

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ryzendfm/Porsche-WebGL-landing-page.git
   cd Porsche-WebGL-landing-page
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Build the application for production:
   ```bash
   npm run build
   ```

5. Preview the production build locally:
   ```bash
   npm run preview
   ```

---

## 📂 Project Structure

```
├── public/                 # Static assets (3D model, HDR environmental maps, GIFs)
├── src/
│   ├── registry/
│   │   └── magicui/
│   │       └── smooth-cursor.jsx  # Framer Motion custom cursor hook & component
│   ├── camera-path.json    # Pre-calculated 3D camera keyframes
│   ├── CarScene.css        # Layout structure, scroll animations styling, preloader
│   ├── CarScene.jsx        # Main WebGL Canvas, model renderer, and story sections
│   ├── CustomScrollbar.jsx # Floating custom scrollbar component
│   ├── main.jsx            # Application entrypoint
│   └── main.css            # CSS Reset and global layout rules
├── .gitignore              # Ignored files (node_modules, builds, caches)
├── vite.config.js          # Vite configuration
└── package.json            # Scripts & dependencies
```

---

## 🎨 Acknowledgements & Credits

- 3D Model: Porsche 911 Carrera 4S, optimized and textured by **Sooriyaa**.
- Design Inspiration: Porsche design language, featuring sleek dark modes and classic racing red highlights.
- Preloader Animation: Shifting box loader design.
