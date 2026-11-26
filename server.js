const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Base de datos SQLite nativa (se crea automáticamente como vetcare.db)
const db = new DatabaseSync('./vetcare.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS historial_medico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mascota TEXT,
    fecha TEXT,
    motivo TEXT,
    veterinario TEXT,
    diagnostico TEXT,
    formula TEXT
  );
  CREATE TABLE IF NOT EXISTS citas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mascota TEXT,
    fecha_hora TEXT,
    horas_restantes INTEGER,
    estado TEXT
  );
`);

const countHist = db.prepare("SELECT COUNT(*) as count FROM historial_medico").get();
if (countHist.count === 0) {
  const insertH = db.prepare(`INSERT INTO historial_medico (mascota, fecha, motivo, veterinario, diagnostico, formula) VALUES (?, ?, ?, ?, ?, ?)`);
  insertH.run('Max (Golden Retriever)', '2026-10-15', 'Control vacunación anual', 'Dra. Camila Rojas', 'Paciente sano, esquema al día', 'Refuerzo Polivalente - Dosis única');
  insertH.run('Max (Golden Retriever)', '2026-11-02', 'Otitis leve oído derecho', 'Dr. Andrés Gómez', 'Inflamación del canal auditivo externo', 'OticVet Gotas - 3 gotas cada 12h por 7 días');
  insertH.run('Luna (Gato Persa)', '2026-11-10', 'Revisión gastrointestinal', 'Dra. Camila Rojas', 'Gastritis leve por bola de pelo', 'Malta Felina - 2 cm diarios por 5 días');
}

const countCitas = db.prepare("SELECT COUNT(*) as count FROM citas").get();
if (countCitas.count === 0) {
  const insertC = db.prepare(`INSERT INTO citas (mascota, fecha_hora, horas_restantes, estado) VALUES (?, ?, ?, ?)`);
  insertC.run('Max (Golden Retriever)', '2026-11-28 10:00 AM', 48, 'Agendada');
  insertC.run('Luna (Gato Persa)', '2026-11-26 08:00 AM', 6, 'Agendada');
}

// HU-05: Consultar historial médico
app.get('/api/historial', (req, res) => {
  const { mascota } = req.query;
  const rows = mascota && mascota !== 'TODAS'
    ? db.prepare('SELECT * FROM historial_medico WHERE mascota = ?').all(mascota)
    : db.prepare('SELECT * FROM historial_medico').all();
  res.json(rows);
});

// HU-06: Registrar diagnóstico y fórmula
app.post('/api/diagnosticos', (req, res) => {
  const { cita_id, mascota, motivo, veterinario, diagnostico, medicamento, dosis, duracion } = req.body;
  if (!diagnostico || diagnostico.trim() === '') {
    return res.status(400).json({ error: 'El campo diagnóstico es obligatorio.' });
  }
  const formula = `${medicamento} - ${dosis} por ${duracion}`;
  const fecha = new Date().toISOString().split('T')[0];

  const info = db.prepare(
    `INSERT INTO historial_medico (mascota, fecha, motivo, veterinario, diagnostico, formula) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(mascota, fecha, motivo, veterinario, diagnostico, formula);

  res.status(201).json({
    mensaje: 'Diagnóstico y fórmula guardados correctamente',
    registro_id: Number(info.lastInsertRowid),
    cita_id_asociada: cita_id,
    diagnostico,
    formula
  });
});

// Consultar citas
app.get('/api/citas', (req, res) => {
  const rows = db.prepare('SELECT * FROM citas').all();
  res.json(rows);
});

// HU-07: Cancelación autónoma de citas (mínimo 12 horas)
app.patch('/api/citas/:id/cancelar', (req, res) => {
  const { id } = req.params;
  const cita = db.prepare('SELECT * FROM citas WHERE id = ?').get(id);
  if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });
  if (cita.horas_restantes < 12) {
    return res.status(400).json({ error: 'No se puede cancelar con menos de 12 horas de anticipación.' });
  }
  db.prepare("UPDATE citas SET estado = 'Cancelada' WHERE id = ?").run(id);
  res.json({ mensaje: 'Cita actualizada a Cancelada en BD', id, estado: 'Cancelada' });
});

// HU-09: Agendar cita + Cola de mensajería y envío SMTP simulado
app.post('/api/citas', (req, res) => {
  const { mascota, fecha_hora, correo } = req.body;
  const info = db.prepare(
    "INSERT INTO citas (mascota, fecha_hora, horas_restantes, estado) VALUES (?, ?, 36, 'Agendada')"
  ).run(mascota, fecha_hora);

  const nuevaCitaId = Number(info.lastInsertRowid);
  console.log(`\n[COLA MENSAJERÍA - HU-09] Encolando correo de recordatorio para: ${correo}`);
  console.log(`[SMTP WORKER] Intento 1: Simulando latencia de red... Reintentando en 1s...`);
  setTimeout(() => {
    console.log(`[SMTP WORKER] Intento 2: Correo HTML enviado exitosamente a ${correo} (Cita #${nuevaCitaId} - ${fecha_hora})\n`);
  }, 1000);

  res.status(201).json({
    mensaje: 'Cita agendada y correo encolado',
    cita_id: nuevaCitaId,
    correo_preview: {
      para: correo,
      asunto: `Recordatorio de Cita Veterinaria - ${mascota}`,
      fecha_hora,
      recomendaciones: 'Llegar 10 minutos antes. Traer carné de vacunación y mantener ayuno de 4 horas si requiere exámenes.'
    }
  });
});

app.listen(3000, () => {
  console.log('Servidor VetCare corriendo en http://localhost:3000');
});
