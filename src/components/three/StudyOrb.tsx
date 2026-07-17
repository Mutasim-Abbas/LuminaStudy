import { useMemo, useRef, type CSSProperties } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';

/**
 * The dashboard hero: a slowly-rotating "knowledge orb" — a wireframe
 * icosahedron with study-card shards orbiting it, lit in the Lumina palette.
 * Pure decoration; the camera drifts with the pointer for parallax depth.
 *
 * Performance: ~13 small meshes, no shadows, no post-processing. Capped DPR.
 */

const INDIGO = new THREE.Color('#2e3192');
const MINT = new THREE.Color('#2ee8ac');
const PERIWINKLE = new THREE.Color('#6d70d8');

function Core() {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (!mesh.current) return;
    mesh.current.rotation.y += delta * 0.18;
    mesh.current.rotation.x += delta * 0.06;
  });
  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[1.35, 1]} />
      <meshStandardMaterial
        color={INDIGO}
        emissive={INDIGO}
        emissiveIntensity={0.35}
        wireframe
        roughness={0.4}
      />
    </mesh>
  );
}

/** Small cards orbiting the core — each one a "flashcard" of knowledge. */
function Shard({ index, total }: { index: number; total: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const { radius, speed, tilt, phase } = useMemo(() => {
    const golden = index * 2.399963;
    return {
      radius: 2.1 + (index % 3) * 0.32,
      speed: 0.22 + (index % 4) * 0.045,
      tilt: (index / total) * Math.PI - Math.PI / 2,
      phase: golden,
    };
  }, [index, total]);

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const t = clock.getElapsedTime() * speed + phase;
    mesh.current.position.set(
      Math.cos(t) * radius,
      Math.sin(t * 0.8) * 0.85 + Math.sin(tilt) * 0.5,
      Math.sin(t) * radius * 0.6,
    );
    mesh.current.rotation.set(t * 0.5, t * 0.7, 0);
  });

  // On a light page, pure-white shards disappear — alternate mint with a
  // periwinkle indigo so every shard reads against the background.
  const isMint = index % 3 === 0;
  const color = isMint ? MINT : PERIWINKLE;
  return (
    <mesh ref={mesh}>
      <boxGeometry args={[0.44, 0.58, 0.04]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={isMint ? 0.45 : 0.3}
        roughness={0.3}
        metalness={0.05}
      />
    </mesh>
  );
}

function Rig() {
  useFrame(({ pointer, camera }) => {
    camera.position.x += (pointer.x * 1.4 - camera.position.x) * 0.035;
    camera.position.y += (pointer.y * 0.7 + 0.3 - camera.position.y) * 0.035;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

const SHARDS = 12;

export function StudyOrb({ style }: { style?: CSSProperties }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.3, 6.2], fov: 45 }}
      style={style}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 5, 4]} intensity={1.1} />
      <pointLight position={[-4, -1, 3]} intensity={22} color="#2ee8ac" distance={14} />
      <pointLight position={[4, 2, 2]} intensity={16} color="#6d70d8" distance={14} />
      <Float speed={1.1} rotationIntensity={0.2} floatIntensity={0.35}>
        <Core />
      </Float>
      {Array.from({ length: SHARDS }, (_, i) => (
        <Shard key={i} index={i} total={SHARDS} />
      ))}
      <Rig />
    </Canvas>
  );
}
