import ReactDOM from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { StrictMode, Suspense } from 'react'

import Loader from './Components/Loader.jsx'
import App from './App.jsx'
import './index.css'

const isMobile = () => {
    return ( ( window.innerWidth <= 1000 ) && ( window.innerHeight <= 800 ) );
  }

const root = ReactDOM.createRoot(document.querySelector('#root'))

const fovForMobile = 100
const fovForPc = 45

root.render(
    <StrictMode>
        <Canvas
            camera={{
            fov: isMobile() ? fovForMobile : fovForPc,
            near: 0.1,
            far: 200,
            position: [52, 7, 12],
        }}
        >
            <Suspense fallback={<Loader/>}>
                <App/>   
            </Suspense>

            {/*<Perf position="top-left" />*/}
        </Canvas>

        {/* SEO fallback content — visible only when JavaScript is disabled */}
        <div style={{ display: "none" }}>
  <section aria-hidden="true">
    <h1>RAKESH.QD.JE - IT Company</h1>
    <h2>Immersive Web Experiences & Full-Stack Development</h2>
    <h2>Three.js and React Three Fiber 3D Solutions</h2>
    <h2>Creative Technology Company based in Hyderabad</h2>
  </section>
  <section aria-hidden="true">
    <h2>Our Services</h2>
    <ul>
      <li>Three.js & WebGL Development</li>
      <li>React Three Fiber Applications</li>
      <li>GSAP Animation & Interactive Experiences</li>
      <li>3D Web Experiences</li>
      <li>Full-Stack Web Development</li>
    </ul>
  </section>
  <section aria-hidden="true">
    <p>
      Welcome to RAKESH.QD.JE — an IT company specialising in immersive web
      experiences and creative technology. This interactive 3D portfolio is
      built with React Three Fiber, GSAP, and custom Blender models.
      Explore our projects at sharelink.rakesh.qd.je and file.rakesh.qd.je.
    </p>
  </section>
  <noscript>
    <p>
      RAKESH.QD.JE is an IT company delivering immersive web development,
      Three.js, and GSAP-powered experiences. Please enable JavaScript to
      explore the interactive 3D portfolio.
    </p>
  </noscript>
</div>

    </StrictMode>

        
    
)