import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Html, Line } from '@react-three/drei'
import * as THREE from 'three'

/* ── constants ─────────────────────────────────── */

const SKY_R = 20
const ACTIONS = { PLACE: 'place', CONNECT: 'connect', MOVE: 'move' }
const ACTION_LABELS = { place: '落星', connect: '连线', move: '移星' }
const VIEW_MODES = { CREATE: 'create', OBSERVE: 'observe' }
const ACTION_HINTS = {
  place: '点击选定位置，确认后落星',
  connect: '依次点击两颗星连线',
  move: '拖拽星辰移动位置',
}
const DRAG_THRESHOLD = 5

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

/* ── diamond ground plane ────────────────────────── */

function GroundPlane() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const s = SKY_R * 2
    const verts = new Float32Array([
      s, -SKY_R * 0.6, 0,
      0, -SKY_R * 0.6, s,
      -s, -SKY_R * 0.6, 0,
      0, -SKY_R * 0.6, -s,
    ])
    const idx = [0, 1, 2, 0, 2, 3]
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }, [])

  return (
    <mesh geometry={geo}>
      <meshBasicMaterial
        color="#0a0e1a"
        transparent
        opacity={0.6}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

function GroundGrid() {
  const lines = useMemo(() => {
    const result = []
    const y = -SKY_R * 0.6
    const size = SKY_R * 1.8
    const step = 2
    for (let i = -size; i <= size; i += step) {
      result.push([[i, y, -size], [i, y, size]])
      result.push([[-size, y, i], [size, y, i]])
    }
    return result
  }, [])

  return (
    <group>
      {lines.map((pts, i) => (
        <Line key={i} points={pts} color="#1a2040" lineWidth={0.5} transparent opacity={0.12} />
      ))}
    </group>
  )
}

/* ── adaptive 3D space grid ──────────────────────── */

function SpaceGrid() {
  const { camera } = useThree()
  const groupRef = useRef()

  useFrame(() => {
    if (!groupRef.current) return
    const dist = camera.position.length()
    const scale = Math.max(0.5, Math.min(3, dist / 30))
    groupRef.current.scale.setScalar(scale)
  })

  const lines = useMemo(() => {
    const result = []
    const extent = 20
    const step = 4
    for (let i = -extent; i <= extent; i += step) {
      for (let j = -extent; j <= extent; j += step) {
        result.push([[i, j, -extent], [i, j, extent]])
        result.push([[i, -extent, j], [i, extent, j]])
        result.push([[-extent, i, j], [extent, i, j]])
      }
    }
    return result
  }, [])

  return (
    <group ref={groupRef}>
      {lines.map((pts, i) => (
        <Line key={i} points={pts} color="#1a2545" lineWidth={0.3} transparent opacity={0.04} />
      ))}
    </group>
  )
}

/* ── XYZ coordinate axes ─────────────────────────── */

const AXIS_LEN = SKY_R * 1.5

function CoordinateAxes({ blur }) {
  const opacity = blur ? 0.12 : 0.6
  const labelOpacity = blur ? 0.3 : 0.9
  const lineWidth = blur ? 1 : 2
  return (
    <group>
      <Line points={[[-AXIS_LEN, 0, 0], [AXIS_LEN, 0, 0]]} color="#ff4060" lineWidth={lineWidth} transparent opacity={opacity} />
      <Line points={[[0, -AXIS_LEN, 0], [0, AXIS_LEN, 0]]} color="#40ff60" lineWidth={lineWidth} transparent opacity={opacity} />
      <Line points={[[0, 0, -AXIS_LEN], [0, 0, AXIS_LEN]]} color="#4060ff" lineWidth={lineWidth} transparent opacity={opacity} />
      <Html position={[AXIS_LEN + 1, 0, 0]} center style={{ pointerEvents: 'none' }}>
        <span style={{ color: '#ff4060', fontSize: '12px', fontWeight: 600, opacity: labelOpacity }}>X</span>
      </Html>
      <Html position={[0, AXIS_LEN + 1, 0]} center style={{ pointerEvents: 'none' }}>
        <span style={{ color: '#40ff60', fontSize: '12px', fontWeight: 600, opacity: labelOpacity }}>Y</span>
      </Html>
      <Html position={[0, 0, AXIS_LEN + 1]} center style={{ pointerEvents: 'none' }}>
        <span style={{ color: '#4060ff', fontSize: '12px', fontWeight: 600, opacity: labelOpacity }}>Z</span>
      </Html>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.2, 10, 10]} />
        <meshBasicMaterial color="#ccc" transparent opacity={blur ? 0.15 : 0.5} />
      </mesh>
    </group>
  )
}

/* ── invisible click sphere for placing stars ──── */

function ClickSphere({ active, pending, onPending, onCancelPending }) {
  const pointerDownPos = useRef(null)

  return (
    <mesh
      onPointerDown={(e) => {
        if (!active) return
        pointerDownPos.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
      }}
      onPointerUp={(e) => {
        if (!active || !pointerDownPos.current) return
        const dx = e.nativeEvent.clientX - pointerDownPos.current.x
        const dy = e.nativeEvent.clientY - pointerDownPos.current.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        pointerDownPos.current = null
        if (dist > DRAG_THRESHOLD) return
        e.stopPropagation()
        const p = e.point.clone().normalize().multiplyScalar(SKY_R)
        if (pending) onCancelPending()
        onPending(p)
      }}
    >
      <sphereGeometry args={[SKY_R, 64, 64]} />
      <meshBasicMaterial side={THREE.BackSide} transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

/* ── pending star preview with confirm/cancel + depth slider ── */

function PendingStar({ position, depth, onConfirm, onCancel, onDepthChange, glowTex }) {
  const actualR = SKY_R * depth
  const displayPos = useMemo(() => {
    const v = new THREE.Vector3(position.x, position.y, position.z).normalize().multiplyScalar(actualR)
    return [v.x, v.y, v.z]
  }, [position, actualR])

  return (
    <group position={displayPos}>
      <sprite scale={[3.6, 3.6, 1]}>
        <spriteMaterial map={glowTex} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <mesh>
        <sphereGeometry args={[0.36, 12, 12]} />
        <meshBasicMaterial color="#f0e8d8" transparent opacity={0.5} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.56, 16, 16]} />
        <meshBasicMaterial wireframe color="#c9a55a" transparent opacity={0.35} />
      </mesh>
      <Html position={[0, -1.2, 0]} center style={{ pointerEvents: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#888', fontSize: '10px' }}>深度</span>
            <input type="range" min="0.1" max="1" step="0.05" value={depth}
              onChange={(e) => onDepthChange(Number(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              style={{ width: '60px', accentColor: '#c9a55a' }} />
            <span style={{ color: '#666', fontSize: '9px', width: '28px' }}>{Math.round(depth * 100)}%</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={(e) => { e.stopPropagation(); onConfirm() }}
              style={{ padding: '4px 12px', fontSize: '11px', border: '1px solid rgba(201,165,90,0.4)', borderRadius: '5px', cursor: 'pointer', background: 'rgba(201,165,90,0.2)', color: '#c9a55a', backdropFilter: 'blur(8px)' }}>
              确认
            </button>
            <button onClick={(e) => { e.stopPropagation(); onCancel() }}
              style={{ padding: '4px 12px', fontSize: '11px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: '#888', backdropFilter: 'blur(8px)' }}>
              取消
            </button>
          </div>
        </div>
      </Html>
    </group>
  )
}

/* ── single star ───────────────────────────────── */

function StarMesh({ star, isSelected, isConnectFrom, onClick, onPointerDown, glowTex }) {
  const s = star.size * 0.12
  return (
    <group position={[star.x, star.y, star.z]}>
      <sprite scale={[star.size * 1.2, star.size * 1.2, 1]}>
        <spriteMaterial map={glowTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <mesh
        onClick={(e) => { e.stopPropagation(); onClick(star) }}
        onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, star) }}
      >
        <sphereGeometry args={[s, 12, 12]} />
        <meshBasicMaterial color="#f0e8d8" />
      </mesh>
      {(isSelected || isConnectFrom) && (
        <mesh>
          <sphereGeometry args={[s + 0.2, 16, 16]} />
          <meshBasicMaterial wireframe color="#c9a55a" transparent opacity={isConnectFrom ? 0.7 : 0.4} />
        </mesh>
      )}
      {star.name && (
        <Html position={[0, -s - 0.6, 0]} center style={{ pointerEvents: 'none' }}>
          <div style={{ color: '#d8d4cb', fontSize: '11px', letterSpacing: '0.06em', whiteSpace: 'nowrap',
            textShadow: '0 0 10px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.6)',
            fontFamily: "'SF Pro Text', -apple-system, sans-serif" }}>
            {star.name}
          </div>
        </Html>
      )}
    </group>
  )
}

/* ── scene content ─────────────────────────────── */

function SceneContent({
  stars, connections, action, selected, connectFrom,
  onPlace, onStarClick, onStarPointerDown,
  controlsRef, dragging, onDrag, onDragEnd,
  pending, pendingDepth, onPending, onCancelPending, onConfirmPending, onPendingDepthChange,
  axesMode, viewMode, ctrlHeld,
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
      if (raycaster.ray.intersectSphere(sphere, target)) onDrag(target)
    }
    const onUp = () => onDragEnd()
    gl.domElement.addEventListener('pointermove', onMove)
    gl.domElement.addEventListener('pointerup', onUp)
    return () => {
      gl.domElement.removeEventListener('pointermove', onMove)
      gl.domElement.removeEventListener('pointerup', onUp)
    }
  }, [dragging, camera, gl, raycaster, onDrag, onDragEnd])

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.enabled = !dragging
  }, [dragging, controlsRef])

  /* view mode controls */
  useEffect(() => {
    if (!controlsRef.current || dragging) return
    const c = controlsRef.current
    if (viewMode === VIEW_MODES.CREATE) {
      c.enableRotate = false
      c.enablePan = true
      c.enableZoom = true
      c.screenSpacePanning = true
    } else {
      if (ctrlHeld) {
        c.enableRotate = false
        c.enablePan = true
      } else {
        c.enableRotate = true
        c.enablePan = false
      }
      c.enableZoom = true
      c.screenSpacePanning = true
    }
  }, [viewMode, ctrlHeld, dragging, controlsRef])

  return (
    <>
      <ambientLight intensity={0.15} />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        minDistance={3}
        maxDistance={100}
        enablePan={false}
        screenSpacePanning
      />

      <BackgroundStars />
      <GroundPlane />
      <GroundGrid />
      <SpaceGrid />
      {axesMode !== 'hidden' && <CoordinateAxes blur={axesMode === 'blur'} />}
      <ClickSphere
        active={action === 'place'}
        pending={pending}
        onPending={onPending}
        onCancelPending={onCancelPending}
      />

      {pending && (
        <PendingStar
          position={pending}
          depth={pendingDepth}
          onConfirm={onConfirmPending}
          onCancel={onCancelPending}
          onDepthChange={onPendingDepthChange}
          glowTex={glowTex}
        />
      )}

      {connections.map((conn, i) => {
        const a = stars.find((s) => s.id === conn.from)
        const b = stars.find((s) => s.id === conn.to)
        if (!a || !b) return null
        return (
          <Line key={`c${i}`} points={[[a.x, a.y, a.z], [b.x, b.y, b.z]]}
            color="#6680aa" lineWidth={1} transparent opacity={0.4} />
        )
      })}

      {stars.map((star) => (
        <StarMesh key={star.id} star={star}
          isSelected={star.id === selected} isConnectFrom={star.id === connectFrom}
          onClick={onStarClick} onPointerDown={onStarPointerDown} glowTex={glowTex} />
      ))}
    </>
  )
}

/* ── shared UI styles ──────────────────────────── */

const panelBg = 'rgba(8,12,24,0.92)'
const panelBorder = '1px solid rgba(255,255,255,0.08)'
const gold = '#c9a55a'

const btnStyle = (active) => ({
  padding: '6px 14px', fontSize: '12px', border: 'none', borderRadius: '6px',
  cursor: 'pointer', transition: 'all 0.2s',
  background: active ? 'rgba(201,165,90,0.2)' : 'transparent',
  color: active ? gold : '#888', fontWeight: active ? 600 : 400,
})

const inputStyle = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '6px', padding: '6px 10px', color: '#d8d4cb', fontSize: '13px',
  width: '120px', outline: 'none', fontFamily: 'inherit',
}

const coordInputStyle = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '4px', padding: '4px 6px', color: '#d8d4cb', fontSize: '12px',
  width: '50px', outline: 'none', fontFamily: 'inherit', textAlign: 'center',
}

/* ── main app ──────────────────────────────────── */

export default function DesignYourSky() {
  const [stars, setStars] = useState([])
  const [connections, setConnections] = useState([])
  const [action, setAction] = useState(ACTIONS.PLACE)
  const [viewMode, setViewMode] = useState(VIEW_MODES.CREATE)
  const [selected, setSelected] = useState(null)
  const [connectFrom, setConnectFrom] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [editName, setEditName] = useState('')
  const [showList, setShowList] = useState(false)
  const [pending, setPending] = useState(null)
  const [pendingDepth, setPendingDepth] = useState(1)
  const [axesMode, setAxesMode] = useState('show')
  const [ctrlHeld, setCtrlHeld] = useState(false)
  const [showCoordInput, setShowCoordInput] = useState(false)
  const [coordX, setCoordX] = useState('0')
  const [coordY, setCoordY] = useState('0')
  const [coordZ, setCoordZ] = useState('0')
  const controlsRef = useRef()
  const nameInputRef = useRef()

  useEffect(() => {
    const down = (e) => { if (e.key === 'Control') setCtrlHeld(true) }
    const up = (e) => { if (e.key === 'Control') setCtrlHeld(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const handlePlace = useCallback((point) => {
    const id = uid()
    setStars((s) => [...s, { id, x: point.x, y: point.y, z: point.z, name: '', size: 3 }])
    setSelected(null)
    setEditName('')
    setPending(null)
    setPendingDepth(1)
  }, [])

  const handlePending = useCallback((point) => {
    setPending({ x: point.x, y: point.y, z: point.z })
    setPendingDepth(1)
  }, [])

  const handleConfirmPending = useCallback(() => {
    if (!pending) return
    const v = new THREE.Vector3(pending.x, pending.y, pending.z).normalize().multiplyScalar(SKY_R * pendingDepth)
    handlePlace(v)
  }, [pending, pendingDepth, handlePlace])

  const handleCancelPending = useCallback(() => { setPending(null); setPendingDepth(1) }, [])
  const handlePendingDepthChange = useCallback((d) => setPendingDepth(d), [])

  const handleCoordCreate = useCallback(() => {
    const x = parseFloat(coordX), y = parseFloat(coordY), z = parseFloat(coordZ)
    if (isNaN(x) || isNaN(y) || isNaN(z)) return
    const id = uid()
    setStars((s) => [...s, { id, x, y, z, name: '', size: 3 }])
    setCoordX('0'); setCoordY('0'); setCoordZ('0')
  }, [coordX, coordY, coordZ])

  const handleStarClick = useCallback((star) => {
    if (action === ACTIONS.CONNECT) {
      if (connectFrom === null) { setConnectFrom(star.id) }
      else if (connectFrom !== star.id) {
        const exists = connections.some((c) =>
          (c.from === connectFrom && c.to === star.id) || (c.from === star.id && c.to === connectFrom))
        if (!exists) setConnections((c) => [...c, { from: connectFrom, to: star.id }])
        setConnectFrom(null)
      }
    } else {
      setSelected(star.id)
      setEditName(star.name)
      setTimeout(() => nameInputRef.current?.focus(), 80)
    }
  }, [action, connectFrom, connections])

  const handleStarPointerDown = useCallback((_e, star) => {
    if (action === ACTIONS.MOVE) { setDragging(star.id); setSelected(star.id); setEditName(star.name) }
  }, [action])

  const handleDrag = useCallback((point) => {
    if (dragging === null) return
    setStars((s) => s.map((star) =>
      star.id === dragging ? { ...star, x: point.x, y: point.y, z: point.z } : star))
  }, [dragging])

  const handleDragEnd = useCallback(() => setDragging(null), [])

  const updateStarName = useCallback((name) => {
    setEditName(name)
    setStars((s) => s.map((star) => (star.id === selected ? { ...star, name } : star)))
  }, [selected])

  const updateStarSize = useCallback((size) => {
    setStars((s) => s.map((star) => (star.id === selected ? { ...star, size: Number(size) } : star)))
  }, [selected])

  const deleteStar = useCallback(() => {
    setStars((s) => s.filter((star) => star.id !== selected))
    setConnections((c) => c.filter((conn) => conn.from !== selected && conn.to !== selected))
    setSelected(null); setEditName('')
  }, [selected])

  const clearAll = useCallback(() => {
    if (!window.confirm('确定要清空所有星辰和连线吗？')) return
    setStars([]); setConnections([]); setSelected(null); setConnectFrom(null)
    setEditName(''); setPending(null); setPendingDepth(1); _id = 0
  }, [])

  const selectedStar = stars.find((s) => s.id === selected)
  const namedStars = stars.filter((s) => s.name.trim())

  const viewHint = viewMode === VIEW_MODES.CREATE
    ? '滚轮缩放 · 拖拽平移 · 坐标轴固定'
    : 'Ctrl+拖拽平移 · 拖拽旋转视角'

  return (
    <div style={{ width: '100%', height: '100vh', background: '#040610',
      fontFamily: "'SF Pro Text', -apple-system, 'Segoe UI', sans-serif",
      color: '#d8d4cb', position: 'relative', overflow: 'hidden' }}>

      <Canvas camera={{ position: [0, 5, 40], fov: 50, near: 0.1, far: 300 }}
        style={{ position: 'absolute', inset: 0 }} gl={{ antialias: true }}>
        <SceneContent
          stars={stars} connections={connections} action={action} selected={selected}
          connectFrom={connectFrom} onPlace={handlePlace} onStarClick={handleStarClick}
          onStarPointerDown={handleStarPointerDown} controlsRef={controlsRef}
          dragging={dragging} onDrag={handleDrag} onDragEnd={handleDragEnd}
          pending={pending} pendingDepth={pendingDepth} onPending={handlePending}
          onCancelPending={handleCancelPending} onConfirmPending={handleConfirmPending}
          onPendingDepthChange={handlePendingDepthChange}
          axesMode={axesMode} viewMode={viewMode} ctrlHeld={ctrlHeld} />
      </Canvas>

      {/* ── toolbar ── */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px',
        background: 'linear-gradient(180deg, rgba(4,6,16,0.85) 0%, transparent 100%)',
        flexWrap: 'wrap', gap: '8px', zIndex: 10, pointerEvents: 'none' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', pointerEvents: 'auto' }}>
          <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 500, letterSpacing: '0.08em', color: gold }}>
            DESIGN YOUR SKY
          </h1>

          {/* view mode toggle */}
          <div style={{ display: 'flex', gap: '2px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '2px' }}>
            {Object.values(VIEW_MODES).map((vm) => (
              <button key={vm} onClick={() => setViewMode(vm)}
                style={btnStyle(viewMode === vm)}>
                {vm === 'create' ? '创建' : '观察'}
              </button>
            ))}
          </div>

          {/* action buttons */}
          <div style={{ display: 'flex', gap: '2px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '2px' }}>
            {Object.values(ACTIONS).map((val) => (
              <button key={val} onClick={() => { setAction(val); setConnectFrom(null); setPending(null); setPendingDepth(1) }}
                style={btnStyle(action === val)}>
                {ACTION_LABELS[val]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', pointerEvents: 'auto' }}>
          <span style={{ fontSize: '11px', color: '#555', marginRight: '4px' }}>
            {ACTION_HINTS[action]} · {viewHint}
          </span>
          <button onClick={() => setShowCoordInput((v) => !v)}
            style={{ padding: '6px 12px', fontSize: '12px', border: panelBorder, borderRadius: '6px', cursor: 'pointer',
              background: showCoordInput ? 'rgba(201,165,90,0.15)' : 'rgba(255,255,255,0.04)',
              color: showCoordInput ? gold : '#888' }}>
            坐标创建
          </button>
          <button onClick={() => setShowList((v) => !v)}
            style={{ padding: '6px 12px', fontSize: '12px', border: panelBorder, borderRadius: '6px', cursor: 'pointer',
              background: showList ? 'rgba(201,165,90,0.15)' : 'rgba(255,255,255,0.04)',
              color: showList ? gold : '#888' }}>
            星册 {namedStars.length > 0 && `(${namedStars.length})`}
          </button>
          <button onClick={() => setAxesMode((m) => m === 'show' ? 'blur' : m === 'blur' ? 'hidden' : 'show')}
            style={{ padding: '6px 12px', fontSize: '12px', border: panelBorder, borderRadius: '6px', cursor: 'pointer',
              background: axesMode !== 'hidden' ? 'rgba(201,165,90,0.15)' : 'rgba(255,255,255,0.04)',
              color: axesMode !== 'hidden' ? gold : '#888' }}>
            坐标轴{axesMode === 'blur' ? '(虚化)' : axesMode === 'hidden' ? '(隐藏)' : ''}
          </button>
          <button onClick={clearAll}
            style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid rgba(255,80,80,0.15)',
              borderRadius: '6px', cursor: 'pointer', background: 'rgba(255,80,80,0.06)',
              color: '#a55', transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.target.style.background = 'rgba(255,60,60,0.25)'; e.target.style.color = '#ff4444'; e.target.style.borderColor = 'rgba(255,60,60,0.5)' }}
            onMouseLeave={(e) => { e.target.style.background = 'rgba(255,80,80,0.06)'; e.target.style.color = '#a55'; e.target.style.borderColor = 'rgba(255,80,80,0.15)' }}>
            清空
          </button>
        </div>
      </div>

      {/* ── coordinate input panel ── */}
      {showCoordInput && (
        <div style={{ position: 'absolute', top: '60px', left: '50%', transform: 'translateX(-50%)',
          background: panelBg, border: panelBorder, borderRadius: '10px', padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: '10px', backdropFilter: 'blur(16px)', zIndex: 10 }}>
          <span style={{ fontSize: '11px', color: '#555' }}>坐标</span>
          {[['X', '#ff4060', coordX, setCoordX], ['Y', '#40ff60', coordY, setCoordY], ['Z', '#4060ff', coordZ, setCoordZ]].map(([l, c, v, set]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: c, fontSize: '10px' }}>{l}</span>
              <input type="number" value={v} onChange={(e) => set(e.target.value)} style={coordInputStyle} />
            </div>
          ))}
          <button onClick={handleCoordCreate}
            style={{ padding: '5px 14px', fontSize: '11px', border: '1px solid rgba(201,165,90,0.4)',
              borderRadius: '5px', cursor: 'pointer', background: 'rgba(201,165,90,0.2)', color: '#c9a55a' }}>
            创建
          </button>
        </div>
      )}

      {/* ── star list sidebar ── */}
      {showList && (
        <div style={{ position: 'absolute', top: '60px', right: '16px', width: '180px',
          maxHeight: 'calc(100vh - 140px)', overflowY: 'auto', background: panelBg, border: panelBorder,
          borderRadius: '10px', padding: '14px', zIndex: 10, backdropFilter: 'blur(16px)' }}>
          <div style={{ fontSize: '11px', color: '#555', letterSpacing: '0.1em', marginBottom: '10px', textTransform: 'uppercase' }}>
            已命名星辰
          </div>
          {namedStars.length === 0
            ? <div style={{ fontSize: '12px', color: '#333' }}>尚未命名任何星辰</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {namedStars.map((s) => (
                  <div key={s.id} onClick={() => { setSelected(s.id); setEditName(s.name) }}
                    style={{ padding: '5px 8px', fontSize: '13px', borderRadius: '4px', cursor: 'pointer',
                      background: selected === s.id ? 'rgba(201,165,90,0.1)' : 'transparent',
                      color: selected === s.id ? gold : '#999', transition: 'all 0.15s' }}>
                    <span style={{ marginRight: '6px', fontSize: '7px' }}>✦</span>{s.name}
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* ── edit panel ── */}
      {selectedStar && (
        <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
          background: panelBg, border: panelBorder, borderRadius: '12px', padding: '14px 20px',
          display: 'flex', alignItems: 'center', gap: '16px', backdropFilter: 'blur(20px)', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '10px', color: '#555' }}>名</span>
            <input ref={nameInputRef} type="text" value={editName}
              onChange={(e) => updateStarName(e.target.value)} placeholder="为此星命名"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(201,165,90,0.4)')}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '10px', color: '#555' }}>大小</span>
            <input type="range" min="1" max="7" step="0.5" value={selectedStar.size}
              onChange={(e) => updateStarSize(e.target.value)} style={{ width: '80px', accentColor: gold }} />
          </div>
          <button onClick={deleteStar}
            style={{ padding: '6px 12px', fontSize: '11px', border: '1px solid rgba(255,80,80,0.2)',
              borderRadius: '6px', cursor: 'pointer', background: 'rgba(255,80,80,0.06)', color: '#a55' }}>
            删除
          </button>
        </div>
      )}

      {/* ── counter ── */}
      <div style={{ position: 'absolute', bottom: '20px', right: '20px', fontSize: '11px', color: '#333', zIndex: 5 }}>
        {stars.length} 星 · {connections.length} 线
      </div>
    </div>
  )
}
