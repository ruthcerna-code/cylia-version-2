// Builds src/catalog/movementCatalog.ts from src/catalog/catalogo-salud-fisica.csv.
// Run with: npm run catalog:build
// Stops with a clear message if the sheet has the wrong number of rows, repeated ids or values out of range.
import fs from 'node:fs';
import path from 'node:path';

const SOURCE = path.resolve(process.argv[2] || 'src/catalog/catalogo-salud-fisica.csv');
const TARGET = path.resolve(process.argv[3] || 'src/catalog/movementCatalog.ts');
const EXPECTED_ROWS = 120;
const PHASES = ['menstrual', 'folicular', 'ovulatoria', 'lutea'];
const INTENSITIES = ['suave', 'moderada', 'alta'];

function fail(message) {
  console.error(`\n✖ catalog:build no generó el catálogo.\n  ${message}\n`);
  process.exit(1);
}

/** Lowercase, no accents, single spaces. Used to compare and to build keys. */
function plain(value) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Same text with one space between words and the first letter in uppercase. */
function tidy(value) {
  const text = value.replace(/\s+/g, ' ').trim().normalize('NFC');
  return text ? text.charAt(0).toLocaleUpperCase('es') + text.slice(1) : '';
}

/** RFC 4180 CSV: fields with commas or quotes are wrapped in double quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (quoted) fail('Hay comillas sin cerrar en el CSV.');
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((item) => item.some((cell) => cell.trim()));
}

if (!fs.existsSync(SOURCE)) fail(`No encuentro ${path.relative(process.cwd(), SOURCE)}.`);
const rows = parseCsv(fs.readFileSync(SOURCE, 'utf8').replace(/^﻿/, ''));
const [header, ...data] = rows;
if (!header || header.length !== 10) fail(`El encabezado debe tener 10 columnas y tiene ${header ? header.length : 0}.`);
if (data.length !== EXPECTED_ROWS) fail(`Se esperaban ${EXPECTED_ROWS} filas de actividades y hay ${data.length}.`);

const seen = new Set();
const typeLabels = new Map();
const activities = data.map((cells, index) => {
  const line = index + 2;
  if (cells.length !== 10) fail(`La fila ${line} tiene ${cells.length} columnas; deben ser 10.`);
  const [idText, nameText, phasesText, intensityText, energyText, typeText, minutesText, placeText, equipmentText, cautionText] = cells;

  const id = Number(idText.trim());
  if (!Number.isInteger(id) || id < 1) fail(`Fila ${line}: el N.º «${idText}» no es un número entero positivo.`);
  if (seen.has(id)) fail(`Fila ${line}: el N.º ${id} está repetido.`);
  seen.add(id);

  const name = tidy(nameText);
  if (!name) fail(`Fila ${line}: falta el nombre de la actividad.`);

  const phaseWords = plain(phasesText).split(',').map((item) => item.trim()).filter(Boolean);
  const phases = phaseWords.includes('todas') ? [...PHASES] : phaseWords;
  if (!phases.length || phases.some((phase) => !PHASES.includes(phase))) {
    fail(`Fila ${line}: las fases «${phasesText}» no son válidas. Usa Menstrual, Folicular, Ovulatoria, Lútea o Todas.`);
  }

  const intensity = plain(intensityText);
  if (!INTENSITIES.includes(intensity)) fail(`Fila ${line}: la intensidad «${intensityText}» debe ser Suave, Moderada o Alta.`);

  const minEnergy = Number(energyText.trim());
  if (!Number.isInteger(minEnergy) || minEnergy < 1 || minEnergy > 5) fail(`Fila ${line}: la energía mínima «${energyText}» debe estar entre 1 y 5.`);

  const type = plain(typeText).replace(/ /g, '_');
  if (!type) fail(`Fila ${line}: falta el tipo.`);
  typeLabels.set(type, tidy(typeText));

  const minutes = Number(minutesText.trim());
  if (!Number.isInteger(minutes) || minutes < 1) fail(`Fila ${line}: la duración «${minutesText}» debe ser un número entero de minutos.`);

  const place = tidy(placeText);
  const equipment = tidy(equipmentText);
  if (!place) fail(`Fila ${line}: falta el lugar.`);
  if (!equipment) fail(`Fila ${line}: falta el equipo (usa «Ninguno» si no necesita).`);

  const caution = tidy(cautionText) || null;
  return { id, name, phases: [...new Set(phases)], intensity, minEnergy, type, minutes, place, equipment, caution };
}).sort((a, b) => a.id - b.id);

const types = [...typeLabels.keys()].sort();
const output = `// Archivo generado por scripts/build-catalog.mjs desde src/catalog/catalogo-salud-fisica.csv.
// No lo edites a mano: cambia la hoja y corre \`npm run catalog:build\`.

export type MovementPhase = 'menstrual' | 'folicular' | 'ovulatoria' | 'lutea';
export type MovementIntensity = 'suave' | 'moderada' | 'alta';
export type MovementType = ${types.map((type) => `'${type}'`).join(' | ')};

export interface MovementActivity {
  id: number;
  name: string;
  phases: MovementPhase[];
  intensity: MovementIntensity;
  /** 1 to 5: the least energy she needs to have today. */
  minEnergy: number;
  type: MovementType;
  minutes: number;
  place: string;
  equipment: string;
  caution: string | null;
}

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
${types.map((type) => `  ${type}: ${JSON.stringify(typeLabels.get(type))},`).join('\n')}
};

export const MOVEMENT_CATALOG: MovementActivity[] = [
${activities.map((item) => `  ${JSON.stringify(item)},`).join('\n')}
];
`;

fs.writeFileSync(TARGET, output);
console.log(`✔ ${path.relative(process.cwd(), TARGET)}: ${activities.length} actividades, ${types.length} tipos.`);
