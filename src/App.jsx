import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchByAuthor, createBlueprint, updateBlueprint, deleteBlueprint,
  setCurrentBlueprint, appendPoint
} from './features/blueprints/blueprintsSlice.js';
import { createStompClient, subscribeBlueprint } from './lib/stompClient.js';
import { createSocket } from './lib/socketIoClient.js';
import api from './services/apiClient.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080'
const IO_BASE = import.meta.env.VITE_IO_BASE ?? 'http://localhost:3001'

export default function App() {
  //Auth
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loginForm, setLoginForm] = useState({ username: 'student', password: 'student123' });

  //UI state
  const [tech, setTech] = useState('stomp');
  const [authorInput, setAuthorInput] = useState('');
  const [newBpName, setNewBpName] = useState('');
  const [rtStatus, setRtStatus] = useState('disconnected');

  //Redux
  const dispatch = useDispatch();
  const { byAuthor, current, currentAuthor, status, error } = useSelector(s => s.blueprints);
  const blueprints = byAuthor[currentAuthor] ?? [];
  const totalPoints = blueprints.reduce((sum, bp) => sum + (bp.points?.length ?? 0), 0);

  //Canvas y RT
  const canvasRef = useRef(null);
  const stompRef = useRef(null);
  const unsubRef = useRef(null);
  const socketRef = useRef(null);
  const pointsRef = useRef([]);

  //Dibujo
  function drawPoints(pts) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 600, 400);
    if (!pts || pts.length === 0) return;
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.stroke();
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#2563eb';
      ctx.fill();
    });
  }

  //Cargar plano canvas
  function openBlueprint(bp) {
    pointsRef.current = [...(bp.points ?? [])];
    dispatch(setCurrentBlueprint(bp));
    drawPoints(pointsRef.current);
    connectRT(bp.author, bp.name);
  }

  //Conexion RT
  function disconnectRT() {
    unsubRef.current?.(); unsubRef.current = null;
    stompRef.current?.deactivate?.(); stompRef.current = null;
    socketRef.current?.disconnect?.(); socketRef.current = null;
    setRtStatus('disconnected');
  }

  function connectRT(author, name) {
    disconnectRT();
    if (tech === 'stomp') {
      const client = createStompClient(API_BASE);
      stompRef.current = client;
      client.onConnect = () => {
        setRtStatus('connected');
        unsubRef.current = subscribeBlueprint(client, author, name, (upd) => {
          pointsRef.current = [...pointsRef.current, upd.point];
          dispatch(appendPoint(upd.point));
          drawPoints(pointsRef.current);
        });
      }
      client.onDisconnect = () => setRtStatus('disconnected');
      client.onStompError = (err) => setRtStatus('disconnected');
      client.activate();
    } else {
      const s = createSocket(IO_BASE);
      socketRef.current = s;
      setRtStatus('connecting');
      s.on('connect', () => {
        setRtStatus('connected');
        s.emit('join-room', `blueprints.${author}.${name}`);
      })
      s.on('blueprint-update', (upd) => {
        pointsRef.current = [...pointsRef.current, upd.point];
        dispatch(appendPoint(upd.point));
        drawPoints(pointsRef.current);
      })
      s.on('disconnect', () => setRtStatus('disconnected'));
    }
  }

  useEffect(() => () => disconnectRT(), []);

  // CLic en vancas -> enviar punto por RT
  function onCanvasClick(e) {
    if (!current) return;
    const rect = e.target.getBoundingClientRect();
    const point = { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) };

    if (tech === 'stomp' && stompRef.current?.connected) {
      stompRef.current.publish({
        destination: '/app/draw',
        body: JSON.stringify({ author: current.author, name: current.name, point })
      })
    } else if (tech === 'socketio' && socketRef.current?.connected) {
      const room = `blueprints.${current.author}.${current.name}`;;
      socketRef.current.emit('draw-event', { room, author: current.author, name: current.name, point });
    }
  }

  //CRUD handlers
  function handleSearch(e) {
    e.preventDefault();
    if (!authorInput.trim()) return;
    dispatch(fetchByAuthor(authorInput.trim()));
    dispatch({ type: 'blueprints/setCurrentAuthor', payload: authorInput.trim() });
  }

  function handleCreate(e) {
    e.preventDefault();
    if (!newBpName.trim() || !currentAuthor) return;
    dispatch(createBlueprint({
      author: currentAuthor,
      name: newBpName.trim(),
      points: []
    }));
    setNewBpName('');
  }

  function handleSave() {
    if (!current) return;
    dispatch(updateBlueprint({
      author: current.author,
      name: current.name,
      points: pointsRef.current
    }));
  }

  function handleDelete() {
    if (!current) return;
    if (!window.confirm(`Are you sure you want to delete blueprint "${current.name}"?`)) return;
    dispatch(deleteBlueprint({ author: current.author, name: current.name }));
    pointsRef.current = [];
    drawPoints([]);
    disconnectRT();
  }

  //login
  async function handleLogin(e) {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      if (!res.ok) { alert('Credenciales invalidas'); return }
      const { access_token } = await res.json();
      localStorage.setItem('token', access_token);
      setToken(access_token);
    } catch {
      alert('Error conectando con el bakcend');
    }
  }

  function handleLogout() {
    localStorage.removeItem('token');
    setToken(null);
    disconnectRT();
  }

  //Render : login
  if (!token) return (
    <div style={styles.loginWrap}>
      <h2>🔐 BluePrints RT — Login</h2>
      <form onSubmit={handleLogin} style={styles.loginForm}>
        <input
          placeholder="Usuario"
          value={loginForm.username}
          onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
          style={styles.input}
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={loginForm.password}
          onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
          style={styles.input}
        />
        <button type="submit" style={styles.btnPrimary}>Ingresar</button>
      </form>
    </div>
  );

  //Render : main app
  return (
    <div style={styles.wrap}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={{ margin: 0 }}>🗺️ BluePrints RT</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <label>Tecnología:</label>
          <select value={tech} onChange={e => { setTech(e.target.value); disconnectRT() }} style={styles.select}>
            <option value="stomp">STOMP (Spring)</option>
            <option value="socketio">Socket.IO (Node)</option>
          </select>
          <span style={{ color: rtStatus === 'connected' ? '#16a34a' : rtStatus === 'connecting' ? '#ca8a04' : '#dc2626', fontWeight: 600 }}>
            ● {rtStatus}
          </span>
          <button onClick={handleLogout} style={styles.btnDanger}>Cerrar sesión</button>
        </div>
      </div>

      <div style={styles.body}>
        {/* Panel izquierdo */}
        <div style={styles.panel}>
          {/* Buscar autor */}
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input
              placeholder="Autor"
              value={authorInput}
              onChange={e => setAuthorInput(e.target.value)}
              style={styles.input}
            />
            <button type="submit" style={styles.btnPrimary}>Buscar</button>
          </form>

          {/* Estado de carga */}
          {status === 'loading' && <p style={{ color: '#6b7280' }}>Cargando...</p>}
          {error && <p style={{ color: '#dc2626' }}>Error: {error}</p>}

          {/* Tabla de planos */}
          {blueprints.length > 0 && (
            <>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Plano</th>
                    <th style={styles.th}>Puntos</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {blueprints.map(bp => (
                    <tr key={bp.name} style={{ background: current?.name === bp.name ? '#eff6ff' : 'white' }}>
                      <td style={styles.td}>{bp.name}</td>
                      <td style={styles.td}>{bp.points?.length ?? 0}</td>
                      <td style={styles.td}>
                        <button onClick={() => openBlueprint(bp)} style={styles.btnSmall}>Open</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>
                Total de puntos: <strong>{totalPoints}</strong>
              </p>
            </>
          )}

          {/* Crear nuevo plano */}
          {currentAuthor && (
            <form onSubmit={handleCreate} style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <input
                placeholder="Nombre del plano"
                value={newBpName}
                onChange={e => setNewBpName(e.target.value)}
                style={styles.input}
              />
              <button type="submit" style={styles.btnSuccess}>+ Crear</button>
            </form>
          )}

          {/* Botones de acción sobre el plano actual */}
          {current && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>
                Plano activo: <strong>{current.author} / {current.name}</strong>
              </p>
              <button onClick={handleSave} style={styles.btnPrimary}>💾 Guardar puntos</button>
              <button onClick={handleDelete} style={styles.btnDanger}>🗑 Eliminar plano</button>
            </div>
          )}
        </div>

        {/* Canvas */}
        <div>
          <canvas
            ref={canvasRef}
            width={600}
            height={400}
            style={styles.canvas}
            onClick={onCanvasClick}
          />
          {!current && (
            <p style={{ textAlign: 'center', color: '#9ca3af', marginTop: 8 }}>
              Selecciona un plano para empezar a dibujar
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Stilos inline

const styles = {
  loginWrap: { maxWidth: 360, margin: '80px auto', fontFamily: 'Inter, system-ui', padding: 24, border: '1px solid #e5e7eb', borderRadius: 12 },
  loginForm: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 },
  wrap: { fontFamily: 'Inter, system-ui', maxWidth: 1100, margin: '0 auto', padding: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #e5e7eb' },
  body: { display: 'flex', gap: 24 },
  panel: { width: 280, flexShrink: 0 },
  input: { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, flex: 1 },
  select: { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 },
  btnPrimary: { padding: '6px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  btnSuccess: { padding: '6px 14px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  btnDanger: { padding: '6px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  btnSmall: { padding: '3px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 },
  canvas: { border: '1px solid #e5e7eb', borderRadius: 12, cursor: 'crosshair', display: 'block' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #e5e7eb', color: '#6b7280' },
  td: { padding: '6px 8px', borderBottom: '1px solid #f3f4f6' },
}
