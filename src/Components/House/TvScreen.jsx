import { useRef, useState } from "react"
import { TextureLoader, Uniform } from 'three'
import { useLoader, useFrame } from "@react-three/fiber"
import { Html } from "@react-three/drei"

import vertexShader from '../../shaders/tvnoise/vertex.glsl'
import fragmentShader from '../../shaders/tvnoise/fragment.glsl'

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT LINKS — add new projects here as they launch under rakesh.qd.je
// Each entry needs:
//   label    : display name shown in the hover tooltip
//   icon     : path to a flat PNG icon in public/logos/
//   url      : the full URL to open on click
//   position : [x, y, z] world position in the 3D scene
//
// When adding a 3rd icon, add a new row by decrementing y (e.g. y: 2.25).
//
// Example — copy this object to add a new project:
// {
//   label: "New Project",
//   icon: "./logos/logoNewProject.png",
//   url: "https://newproject.rakesh.qd.je",
//   position: [0.45, 2.25, -3.48],
// },
// ─────────────────────────────────────────────────────────────────────────────
const PROJECT_LINKS = [
  {
    label: "Share Link",
    icon: "./logos/logoShareLink.png",
    url: "https://sharelink.rakesh.qd.je",
    position: [0.45, 2.45, -3.48],
  },
  {
    label: "File Share",
    icon: "./logos/logoFileShare.png",
    url: "https://file.rakesh.qd.je/445",
    position: [0.77, 2.45, -3.48],
  },
]

const ICON_PATHS = PROJECT_LINKS.map((link) => link.icon)

export default function TvScreen(props)
{
    const planeRef = useRef()
    const logosRef = useRef()

    // hoveredIndex: which icon the user is hovering (-1 = none)
    const [hoveredIndex, setHoveredIndex] = useState(-1)

    const projectTextures = useLoader(TextureLoader, ICON_PATHS)

    useFrame(({ clock }) => {
        planeRef.current.material.uniforms.uTime.value = clock.getElapsedTime()

        if (logosRef.current) {
          logosRef.current.children.forEach((child) => {
            if (child.material) {
              child.material.opacity = props.opacity
            }
          })
        }
    })

    const shaderMaterial = {
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        uniforms: {
          uTime: new Uniform(0),
          uProgress: new Uniform(props.progress)
        }
    }

    const handleClick = (url) => {
      if (props.opacity > 0.9) {
        window.open(url, "_blank")
      }
    }

    return <>
      <ambientLight intensity={1} />

      {/* TV noise / static shader plane */}
      <mesh position={[0.61, 2.35, -3.49]} ref={planeRef}>
          <planeGeometry args={[0.65, 0.45]} />
          <shaderMaterial attach="material" args={[shaderMaterial]} />
      </mesh>

      {/* Project link icons with hover tooltip */}
      <group ref={logosRef}>
        {PROJECT_LINKS.map((link, i) => (
          <mesh
            key={link.label}
            position={link.position}
            scale={[0.13, 0.14, 0.14]}
            onClick={() => handleClick(link.url)}
            onPointerOver={() => setHoveredIndex(i)}
            onPointerOut={() => setHoveredIndex(-1)}
          >
            <planeGeometry/>
            <meshBasicMaterial map={projectTextures[i]} transparent />

            {/* Tooltip — shown on hover/touch */}
            {hoveredIndex === i && (
              <Html
                position={[0, 1.2, 0]}
                center
                style={{ pointerEvents: 'none' }}
              >
                <div style={{
                  background: 'rgba(0,0,0,0.85)',
                  color: '#ffffff',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  border: '1px solid rgba(255,255,255,0.2)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  letterSpacing: '0.5px',
                  textAlign: 'center',
                  lineHeight: '1.5',
                }}>
                  <div style={{ color: '#a0d4ff', fontSize: '11px', marginBottom: '2px' }}>
                    {link.label}
                  </div>
                  <div style={{ color: '#e0e0e0', fontSize: '10px' }}>
                    {link.url.replace('https://', '')}
                  </div>
                </div>
              </Html>
            )}
          </mesh>
        ))}
      </group>
    </>
}