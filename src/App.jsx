import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Html, Line } from '@react-three/drei'
import * as THREE from 'three'

/* ── constants ─────────────────────────────────── */

const SKY_R = 20
const MODES = { PLACE: 'place', CONNECT: 'connect', MOVE: 'move' }
const MODE_LABELS = { place: '落星', connect: '连线', move: '移星' }
const MODE_HINTS = {
  place: '点击星空放置星辰',
  connect: '依次点击两颗星连线',
  move: '拖拽星辰移动位置',
}

let _id = 0
const uid = () => ++_id

/* ── glow texture ──────────────────────────────── */

function createGlowTexture() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,240,220,0.6)')
  g.addColorStop(0.15, 'rgba(220,225,255,0.3)')
  g.addColorStop(0.4, 'rgba(180,200,255,0.08)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

/* ── background stars (distant, non-interactive) ── */

function BackgroundStars() {
  const positions = useMemo(() => {
    const arr = new Float32Array(6000)
    for (let i = 0; i < 6000; i += 3) {
      const r = 80 + Math.random() * 50
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      arr[i] = r * Math.sin(phi) * Math.cos(theta)
      arr[i + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i + 2] = r * Math.cos(phi)
    }
    return arr
  }, [])

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={2000} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.12} color="#8899bb" transparent opacity={0.5} sizeAttenuation />
    </points>
  )
}

/* ── sphere wireframe grid ─────────────────────── */

function SphereGrid() {
  return (
    <mesh>
      <sphereGeometry args={[SKY_R - 0.02, 24, 24]} />
      <meshBasicMaterial wireframe color="#1a2040" transparent opacity={0.05} side={THREE.DoubleSide} />
    </mesh>
  )
}

/* ── invisible click sphere for placing stars ──── */

function ClickSphere({ onPlace, active }) {
  return (
    <mesh
      onClick={(e) => {
        if (!active) return
        e.stopPropagation()
        const p = e.point.clone().normalize().multiplyScalar(SKY_R)
        onPlace(p)
      }}
    >
      <sphereGeometry args={[SKY_R, 64, 64]} />
      <meshBasicMaterial side={THREE.BackSide} transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

/* ── single star ───────────────────────────────── */

function StarMesh({ star, isSelected, isConnectFrom, onClick, onPointerDown, glowTex }) {
  const s = star.size * 0.12
  return (
    <group position={[star.x, star.y, star.z]}>
      {/* glow */}
      <sprite scale={[star.size * 1.2, star.size * 1.2, 1]}>
        <spriteMaterial
          map={glowTex}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      {/* body */}
      <mesh
        onClick={(e) => { e.stopPropagation(); onClick(star) }}
        onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, star) }}
      >
        <sphereGeometry args={[s, 12, 12]} />
        <meshBasicMaterial color="#f0e8d8" />
      </mesh>
      {/* selection indicator */}
      {(isSelected || isConnectFrom) && (
        <mesh>
          <sphereGeometry args={[s + 0.2, 16, 16]} />
          <meshBasicMaterial
            wireframe
            color="#c9a55a"
            transparent
            opacity={isConnectFrom ? 0.7 : 0.4}
          />
        </mesh>
      )}
      {/* name label */}
      {star.name && (
        <Html position={[0, -s - 0.6, 0]} center style={{ pointerEvents: 'none' }}>
          <div
            style={{
              color: '#d8d4cb',
              fontSize: '11px',
              letterSpacing: '0.06em',
              whiteSpace: 'nowrap',
              textShadow: '0 0 10px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.6)',
              fontFamily: "'SF Pro Text', -apple-system, sans-serif",
            }}
          >
            {star.name}
          </div>
        </Html>
      )}
    </group>
  )
}

/* ── scene content ─────────────────────────────── */

function SceneContent({
  stars, connections, mode, selected, connectFrom,
  onPlace, onStarClick, onStarPointerDown,
  controlsRef, dragging, onDrag, onDragEnd,
}) {
  const glowTex = useMemo(() => createGlowTexture(), [])
  const { raycaster, camera, gl } = useThree()

  /* drag handling for move mode */
  useEffect(() => {
    if (!dragging) return
    const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), SKY_R)
    const mouse = new THREE.Vector2()

    const onMove = (e) => {
      const rect = gl.domElement.getBoundingClientRect()
      mouse.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )
      raycaster.setFromCamera(mouse, camera)
      const target = new THREE.Vector3()
      if (raycaster.ray.intersectSphere(sphere, target)) {
        onDrag(target)
      }
    }
    const onUp = () => onDragEnd()

    gl.domElement.addEventListener('pointermove', onMove)
    gl.domElement.addEventListener('pointerup', onUp)
    return () => {
      gl.domElement.removeEventListener('pointermove', onMove)
      gl.domElement.removeEventListener('pointerup', onUp)
    }
  }, [dragging, camera, gl, raycaster, onDrag, onDragEnd])

  /* disable orbit while dragging */
  useEffect(() => {
    if (controlsRef.current) controlsRef.current.enabled = !dragging
  }, [dragging, controlsRef])

  return (
    <>
      <ambientLight intensity={0.15} />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={60}
        enablePan={false}
      />

      <BackgroundStars />
      <SphereGrid />
      <ClickSphere onPlace={onPlace} active={mode === 'place'} />

      {/* connection lines */}
      {connections.map((conn, i) => {
        const a = stars.find((s) => s.id === conn.from)
        const b = stars.find((s) => s.id === conn.to)
        if (!a || !b) return null
        return (
          <Line
            key={`c${i}`}
            points={[[a.x, a.y, a.z], [b.x, b.y, b.z]]}
            color="#6680aa"
            lineWidth={1}
            transparent
            opacity={0.4}
          />
        )
      })}

      {/* stars */}
      {stars.map((star) => (
        <StarMesh
          key={star.id}
          star={star}
          isSelected={star.id === selected}
          isConnectFrom={star.id === connectFrom}
          onClick={onStarClick}
          onPointerDown={onStarPointerDown}
          glowTex={glowTex}
        />
      ))}
    </>
  )
}

/* ── shared UI styles ──────────────────────────── */

const panelBg = 'rgba(8,12,24,0.92)'
const panelBorder = '1px solid rgba(255,255,255,0.08)'
const gold = '#c9a55a'

const btnStyle = (active) => ({
  padding: '6px 14px',
  fontSize: '12px',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  transition: 'all 0.2s',
  background: active ? 'rgba(201,165,90,0.2)' : 'transparent',
  color: active ? gold : '#888',
  fontWeight: active ? 600 : 400,
})

const inputStyle = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '6px',
  padding: '6px 10px',
  color: '#d8d4cb',
  fontSize: '13px',
  width: '120px',
  outline: 'none',
  fontFamily: 'inherit',
}

/* ── main app ──────────────────────────────────── */

export default function DesignYourSky() {
  const [stars, setStars] = useState([])
  const [connections, setConnections] = useState([])
  const [mode, setMode] = useState(MODES.PLACE)
  const [selected, setSelected] = useState(null)
  const [connectFrom, setConnectFrom] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [editName, setEditName] = useState('')
  const [showList, setShowList] = useState(false)
  const controlsRef = useRef()
  const nameInputRef = useRef()

  /* handlers */

  const handlePlace = useCallback((point) => {
    const id = uid()
    setStars((s) => [...s, { id, x: point.x, y: point.y, z: point.z, name: '', size: 3 }])
    setSelected(id)
    setEditName('')
    setTimeout(() => nameInputRef.current?.focus(), 80)
  }, [])

  const handleStarClick = useCallback(
    (star) => {
      if (mode === MODES.CONNECT) {
        if (connectFrom === null) {
          setConnectFrom(star.id)
        } else if (connectFrom !== star.id) {
          const exists = connections.some(
            (c) =>
              (c.from === connectFrom && c.to === star.id) ||
              (c.from === star.id && c.to === connectFrom)
          )
          if (!exists) setConnections((c) => [...c, { from: connectFrom, to: star.id }])
          setConnectFrom(null)
        }
      } else {
        setSelected(star.id)
        setEditName(star.name)
        setTimeout(() => nameInputRef.current?.focus(), 80)
      }
    },
    [mode, connectFrom, connections]
  )

  const handleStarPointerDown = useCallback(
    (_e, star) => {
      if (mode === MODES.MOVE) {
        setDragging(star.id)
        setSelected(star.id)
        setEditName(star.name)
      }
    },
    [mode]
  )

  const handleDrag = useCallback(
    (point) => {
      if (dragging === null) return
      setStars((s) =>
        s.map((star) =>
          star.id === dragging ? { ...star, x: point.x, y: point.y, z: point.z } : star
        )
      )
    },
    [dragging]
  )

  const handleDragEnd = useCallback(() => setDragging(null), [])

  const updateStarName = useCallback(
    (name) => {
      setEditName(name)
      setStars((s) => s.map((star) => (star.id === selected ? { ...star, name } : star)))
    },
    [selected]
  )

  const updateStarSize = useCallback(
    (size) => {
      setStars((s) => s.map((star) => (star.id === selected ? { ...star, size: Number(size) } : star)))
    },
    [selected]
  )

  const deleteStar = useCallback(() => {
    setStars((s) => s.filter((star) => star.id !== selected))
    setConnections((c) => c.filter((conn) => conn.from !== selected && conn.to !== selected))
    setSelected(null)
    setEditName('')
  }, [selected])

  const clearAll = useCallback(() => {
    setStars([])
    setConnections([])
    setSelected(null)
    setConnectFrom(null)
    setEditName('')
    _id = 0
  }, [])

  const selectedStar = stars.find((s) => s.id === selected)
  const namedStars = stars.filter((s) => s.name.trim())

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: '#040610',
        fontFamily: "'SF Pro Text', -apple-system, 'Segoe UI', sans-serif",
        color: '#d8d4cb',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 3D canvas */}
      <Canvas
        camera={{ position: [0, 0, 40], fov: 50, near: 0.1, far: 200 }}
        style={{ position: 'absolute', inset: 0 }}
        gl={{ antialias: true }}
      >
        <SceneContent
          stars={stars}
          connections={connections}
          mode={mode}
          selected={selected}
          connectFrom={connectFrom}
          onPlace={handlePlace}
          onStarClick={handleStarClick}
          onStarPointerDown={handleStarPointerDown}
          controlsRef={controlsRef}
          dragging={dragging}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
        />
      </Canvas>

      {/* ── toolbar ── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: 'linear-gradient(180deg, rgba(4,6,16,0.85) 0%, transparent 100%)',
          flexWrap: 'wrap',
          gap: '8px',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', pointerEvents: 'auto' }}>
          <h1
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 500,
              letterSpacing: '0.08em',
              color: gold,
            }}
          >
            DESIGN YOUR SKY
          </h1>
          <div
            style={{
              display: 'flex',
              gap: '2px',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '8px',
              padding: '2px',
            }}
          >
            {Object.values(MODES).map((val) => (
              <button
                key={val}
                onClick={() => {
                  setMode(val)
                  setConnectFrom(null)
                }}
                style={btnStyle(mode === val)}
              >
                {MODE_LABELS[val]}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', pointerEvents: 'auto' }}>
          <span style={{ fontSize: '11px', color: '#555', marginRight: '4px' }}>
            {MODE_HINTS[mode]}
            {mode !== MODES.MOVE && ' · 拖拽旋转视角'}
          </span>
          <button
            onClick={() => setShowList((v) => !v)}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              border: panelBorder,
              borderRadius: '6px',
              cursor: 'pointer',
              background: showList ? 'rgba(201,165,90,0.15)' : 'rgba(255,255,255,0.04)',
              color: showList ? gold : '#888',
            }}
          >
            星册 {namedStars.length > 0 && `(${namedStars.length})`}
          </button>
          <button
            onClick={clearAll}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              border: '1px solid rgba(255,80,80,0.15)',
              borderRadius: '6px',
              cursor: 'pointer',
              background: 'rgba(255,80,80,0.06)',
              color: '#a55',
            }}
          >
            清空
          </button>
        </div>
      </div>

      {/* ── star list sidebar ── */}
      {showList && (
        <div
          style={{
            position: 'absolute',
            top: '60px',
            right: '16px',
            width: '180px',
            maxHeight: 'calc(100vh - 140px)',
            overflowY: 'auto',
            background: panelBg,
            border: panelBorder,
            borderRadius: '10px',
            padding: '14px',
            zIndex: 10,
            backdropFilter: 'blur(16px)',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              color: '#555',
              letterSpacing: '0.1em',
              marginBottom: '10px',
              textTransform: 'uppercase',
            }}
          >
            已命名星辰
          </div>
          {namedStars.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#333' }}>尚未命名任何星辰</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {namedStars.map((s) => (
                <div
                  key={s.id}
                  onClick={() => {
                    setSelected(s.id)
                    setEditName(s.name)
                  }}
                  style={{
                    padding: '5px 8px',
                    fontSize: '13px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: selected === s.id ? 'rgba(201,165,90,0.1)' : 'transparent',
                    color: selected === s.id ? gold : '#999',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ marginRight: '6px', fontSize: '7px' }}>✦</span>
                  {s.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── edit panel ── */}
      {selectedStar && (
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: panelBg,
            border: panelBorder,
            borderRadius: '12px',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            backdropFilter: 'blur(20px)',
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '10px', color: '#555' }}>名</span>
            <input
              ref={nameInputRef}
              type="text"
              value={editName}
              onChange={(e) => updateStarName(e.target.value)}
              placeholder="为此星命名"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(201,165,90,0.4)')}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '10px', color: '#555' }}>大小</span>
            <input
              type="range"
              min="1"
              max="7"
              step="0.5"
              value={selectedStar.size}
              onChange={(e) => updateStarSize(e.target.value)}
              style={{ width: '80px', accentColor: gold }}
            />
          </div>
          <button
            onClick={deleteStar}
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              border: '1px solid rgba(255,80,80,0.2)',
              borderRadius: '6px',
              cursor: 'pointer',
              background: 'rgba(255,80,80,0.06)',
              color: '#a55',
            }}
          >
            删除
          </button>
        </div>
      )}

      {/* ── counter ── */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          fontSize: '11px',
          color: '#333',
          zIndex: 5,
        }}
      >
        {stars.length} 星 · {connections.length} 线
      </div>
    </div>
  )
}
