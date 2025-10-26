import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut, Move } from 'lucide-react';

/**
 * Ecosystem simulator with:
 * - responsive canvas sized to the browser viewport (minus settings panel)
 * - high-DPI handling (devicePixelRatio)
 * - zoom & pan (mouse wheel to zoom centered at cursor, click+drag to pan)
 * - settings panel on the right (sliders moved into a neat panel)
 * - stats fixed to reflect simulation state
 *
 * Notes:
 * - Internal simulation coordinates use CSS pixels (not device pixels).
 * - Canvas backing store is scaled by devicePixelRatio for crisp rendering.
 * - Transform to account for zoom/pan/DPR is applied via ctx.setTransform.
 */

const EcosystemSimulator = () => {
  const containerRef = useRef(null); // container that holds canvas (left column)
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  // Simulation data in CSS pixels and logical coordinates
  const entitiesRef = useRef([]);
  const buildingBlocksRef = useRef([]);
  const gasGridRef = useRef(null);

  // UI state
  const [isRunning, setIsRunning] = useState(true);
  const [stats, setStats] = useState({});
  const [params, setParams] = useState({
    initialBlocks: 800,
    speed: 0.4,
    attractionRange: 12
  });

  // viewport transform refs (avoid excessive re-renders)
  const dprRef = useRef(window.devicePixelRatio || 1);
  const scaleRef = useRef(1); // zoom scale (1 = 100%)
  const offsetRef = useRef({ x: 0, y: 0 }); // pan offset in CSS pixels (translation of world)
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  // constants
  const PANEL_WIDTH = 340;
  const GRID_CELL_SIZE = 40;

  // Building block types and recipes unchanged
  const BLOCKS = {
    NUTRIENT: { color: '#84cc16', mass: 1 },
    CARBON: { color: '#78716c', mass: 1 },
    PROTEIN: { color: '#ec4899', mass: 1 }
  };

  const ENTITY_RECIPES = {
    SLIME_MOLD: {
      name: 'Slime Mold',
      color: '#fbbf24',
      requires: { NUTRIENT: 4, CARBON: 2 },
      size: 3,
      speed: 0.15,
      metabolism: 0.02,
      starvationTime: 300,
      produces: 'OXYGEN',
      consumes: 'CO2',
      preyOn: [],
      canHibernate: true,
      growthPattern: 'fractal',
      cellShape: 'irregular'
    },
    ALGAE: {
      name: 'Algae',
      color: '#22c55e',
      requires: { NUTRIENT: 3, CARBON: 2 },
      size: 2,
      speed: 0.05,
      metabolism: 0.015,
      starvationTime: 400,
      produces: 'OXYGEN',
      consumes: 'CO2',
      preyOn: [],
      canHibernate: true,
      growthPattern: 'cluster',
      cellShape: 'hexagon'
    },
    BACTERIA: {
      name: 'Bacteria',
      color: '#ec4899',
      requires: { NUTRIENT: 3, PROTEIN: 2 },
      size: 2,
      speed: 0.3,
      metabolism: 0.04,
      starvationTime: 200,
      produces: 'CO2',
      consumes: 'OXYGEN',
      preyOn: ['SLIME_MOLD'],
      canHibernate: true,
      cellShape: 'rod'
    },
    PROTOZOA: {
      name: 'Protozoa',
      color: '#8b5cf6',
      requires: { NUTRIENT: 4, PROTEIN: 3, CARBON: 1 },
      size: 3,
      speed: 0.25,
      metabolism: 0.05,
      starvationTime: 250,
      produces: 'CO2',
      consumes: 'OXYGEN',
      preyOn: ['BACTERIA', 'ALGAE'],
      canHibernate: true,
      cellShape: 'oval'
    },
    PREDATOR: {
      name: 'Predator',
      color: '#ef4444',
      requires: { PROTEIN: 5, CARBON: 3 },
      size: 4,
      speed: 0.4,
      metabolism: 0.08,
      starvationTime: 180,
      produces: 'CO2',
      consumes: 'OXYGEN',
      preyOn: ['PROTOZOA', 'BACTERIA'],
      canHibernate: true,
      cellShape: 'triangle'
    }
  };

  // Helpers to get CSS pixel canvas width/height (the logical world size)
  const getCSSWidth = () => {
    const canvas = canvasRef.current;
    return canvas ? canvas.clientWidth : 0;
  };
  const getCSSHeight = () => {
    const canvas = canvasRef.current;
    return canvas ? canvas.clientHeight : 0;
  };

  // Initialize gas grid sized by CSS pixels
  const initGasGrid = (width, height) => {
    const cols = Math.ceil(width / GRID_CELL_SIZE);
    const rows = Math.ceil(height / GRID_CELL_SIZE);
    const grid = [];
    for (let y = 0; y < rows; y++) {
      grid[y] = [];
      for (let x = 0; x < cols; x++) {
        grid[y][x] = { oxygen: 50, co2: 50 };
      }
    }
    return grid;
  };

  // Map screen (client) coords to world (CSS pixel) coords considering pan & zoom
  const screenToWorld = (screenX, screenY) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const px = screenX - rect.left;
    const py = screenY - rect.top;
    const scale = scaleRef.current;
    const offset = offsetRef.current;
    return {
      x: (px - offset.x) / scale,
      y: (py - offset.y) / scale
    };
  };

  // Clamp offset so the world stays within bounds (when zoomed)
  const clampOffset = () => {
    const cssW = getCSSWidth();
    const cssH = getCSSHeight();
    const scale = scaleRef.current;
    const minX = Math.min(0, cssW - cssW * scale);
    const maxX = 0;
    const minY = Math.min(0, cssH - cssH * scale);
    const maxY = 0;
    offsetRef.current.x = Math.min(Math.max(offsetRef.current.x, minX), maxX);
    offsetRef.current.y = Math.min(Math.max(offsetRef.current.y, minY), maxY);
  };

  // Initialize simulation using CSS pixel sizes
  const initSimulation = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;

    dprRef.current = window.devicePixelRatio || 1;

    // Initialize gas grid sized in CSS pixels
    gasGridRef.current = initGasGrid(cssWidth, cssHeight);

    // Initialize building blocks scattered randomly in CSS coords
    const blocks = [];
    for (let i = 0; i < params.initialBlocks; i++) {
      const types = Object.keys(BLOCKS);
      const type = types[Math.floor(Math.random() * types.length)];
      blocks.push({
        x: Math.random() * cssWidth,
        y: Math.random() * cssHeight,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        type: type,
        free: true,
        age: 0
      });
    }
    buildingBlocksRef.current = blocks;
    entitiesRef.current = [];
    // Reset viewport (centered)
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
  };

  // Try forming entities — unchanged, but uses CSS pixel canvas dims in caller
  const tryFormEntity = (blocks, canvas) => {
    for (let [entityType, recipe] of Object.entries(ENTITY_RECIPES)) {
      if (Math.random() > 0.0005) continue;

      const startIdx = Math.floor(Math.random() * blocks.length);
      const startBlock = blocks[startIdx];

      const nearby = [];
      const range = 30;

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (!block.free) continue;
        const dx = block.x - startBlock.x;
        const dy = block.y - startBlock.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < range) nearby.push({ block, index: i });
      }

      const available = {};
      const indices = [];
      for (let item of nearby) {
        available[item.block.type] = (available[item.block.type] || 0) + 1;
        indices.push(item.index);
      }

      let canForm = true;
      for (let [blockType, amount] of Object.entries(recipe.requires)) {
        if ((available[blockType] || 0) < amount) {
          canForm = false;
          break;
        }
      }

      if (canForm) {
        let cx = 0, cy = 0, count = 0;
        const toRemove = [];
        for (let [blockType, amount] of Object.entries(recipe.requires)) {
          let found = 0;
          for (let i = indices.length - 1; i >= 0; i--) {
            const idx = indices[i];
            if (blocks[idx].type === blockType && found < amount) {
              cx += blocks[idx].x;
              cy += blocks[idx].y;
              count++;
              toRemove.push(idx);
              found++;
            }
          }
        }
        if (count === 0) return null;
        cx /= count;
        cy /= count;
        toRemove.sort((a, b) => b - a);
        for (let idx of toRemove) blocks.splice(idx, 1);

        return {
          id: Math.random(),
          type: entityType,
          x: cx,
          y: cy,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          energy: 100,
          age: 0,
          timeSinceFed: 0,
          hibernating: false,
          starvationResistance: recipe.starvationTime,
          metabolismRate: recipe.metabolism,
          cellBlocks: { ...recipe.requires },
          extensions: []
        };
      }
    }
    return null;
  };

  const distance = (x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Update simulation — uses CSS pixel coords for logic
  const update = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;

    const entities = entitiesRef.current;
    const blocks = buildingBlocksRef.current;
    const gasGrid = gasGridRef.current;

    if (!gasGrid) return;

    // Diffuse gases
    for (let y = 0; y < gasGrid.length; y++) {
      for (let x = 0; x < gasGrid[0].length; x++) {
        const cell = gasGrid[y][x];
        let oxygenDiff = 0;
        let co2Diff = 0;
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < gasGrid.length && nx >= 0 && nx < gasGrid[0].length) {
              oxygenDiff += gasGrid[ny][nx].oxygen;
              co2Diff += gasGrid[ny][nx].co2;
              neighbors++;
            }
          }
        }
        if (neighbors > 0) {
          cell.oxygen = cell.oxygen * 0.95 + (oxygenDiff / neighbors) * 0.05;
          cell.co2 = cell.co2 * 0.95 + (co2Diff / neighbors) * 0.05;
        }
        cell.oxygen = Math.max(0, Math.min(100, cell.oxygen + (50 - cell.oxygen) * 0.001));
        cell.co2 = Math.max(0, Math.min(100, cell.co2 + (50 - cell.co2) * 0.001));
      }
    }

    // Update building blocks
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (!block.free) continue;

      if (Math.random() < 0.02) {
        for (let j = 0; j < blocks.length; j++) {
          if (i === j) continue;
          const other = blocks[j];
          if (!other.free) continue;
          const dist = distance(block.x, block.y, other.x, other.y);
          if (dist < params.attractionRange && dist > 0) {
            const dx = other.x - block.x;
            const dy = other.y - block.y;
            block.vx += (dx / dist) * 0.01;
            block.vy += (dy / dist) * 0.01;
          }
        }
      }

      block.vx *= 0.98;
      block.vy *= 0.98;
      block.x += block.vx * params.speed;
      block.y += block.vy * params.speed;

      // Wrap using CSS dims
      if (block.x < 0) block.x = cssW;
      if (block.x > cssW) block.x = 0;
      if (block.y < 0) block.y = cssH;
      if (block.y > cssH) block.y = 0;
      block.age++;
    }

    // Try form entity
    const newEntity = tryFormEntity(blocks, canvas);
    if (newEntity) entities.push(newEntity);

    // Update entities (most logic unchanged but uses css dims)
    for (let i = entities.length - 1; i >= 0; i--) {
      const entity = entities[i];
      const recipe = ENTITY_RECIPES[entity.type];
      const cell = (y => {
        // getGridCell
        const col = Math.floor(entity.x / GRID_CELL_SIZE);
        const row = Math.floor(entity.y / GRID_CELL_SIZE);
        if (row >= 0 && row < gasGrid.length && col >= 0 && col < gasGrid[0].length) return gasGrid[row][col];
        return null;
      })();

      if (!cell) continue;

      const canBreathe = recipe.consumes === 'OXYGEN' ? cell.oxygen > 10 : cell.co2 > 10;

      if (entity.timeSinceFed > entity.starvationResistance * 0.5 && !canBreathe) entity.hibernating = true;
      if (entity.hibernating && canBreathe && entity.timeSinceFed < entity.starvationResistance * 0.3) entity.hibernating = false;

      const activeMetabolism = entity.hibernating ? entity.metabolismRate * 0.1 : entity.metabolismRate;
      let fx = 0, fy = 0;

      if (!entity.hibernating) {
        let targetX = null, targetY = null, minDist = Infinity;

        if (recipe.preyOn && recipe.preyOn.length > 0) {
          for (let j = 0; j < entities.length; j++) {
            if (i === j) continue;
            const prey = entities[j];
            if (recipe.preyOn.includes(prey.type)) {
              const dist = distance(entity.x, entity.y, prey.x, prey.y);
              if (dist < minDist && dist < 120) {
                minDist = dist;
                targetX = prey.x;
                targetY = prey.y;
              }
            }
          }
        }

        if (targetX !== null) {
          const dx = targetX - entity.x;
          const dy = targetY - entity.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0) {
            fx += (dx / dist) * 0.2;
            fy += (dy / dist) * 0.2;
          }
        } else {
          const desiredGas = recipe.consumes === 'OXYGEN' ? 'oxygen' : 'co2';
          const cellCol = Math.floor(entity.x / GRID_CELL_SIZE);
          const cellRow = Math.floor(entity.y / GRID_CELL_SIZE);
          let bestDir = null;
          let bestValue = cell[desiredGas];

          for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            const checkX = entity.x + Math.cos(angle) * GRID_CELL_SIZE;
            const checkY = entity.y + Math.sin(angle) * GRID_CELL_SIZE;
            const ccol = Math.floor(checkX / GRID_CELL_SIZE);
            const crow = Math.floor(checkY / GRID_CELL_SIZE);
            if (crow >= 0 && crow < gasGrid.length && ccol >= 0 && ccol < gasGrid[0].length) {
              const checkCell = gasGrid[crow][ccol];
              if (checkCell && checkCell[desiredGas] > bestValue) {
                bestValue = checkCell[desiredGas];
                bestDir = angle;
              }
            }
          }

          if (bestDir !== null) {
            fx += Math.cos(bestDir) * 0.1;
            fy += Math.sin(bestDir) * 0.1;
          }

          fx += (Math.random() - 0.5) * 0.05;
          fy += (Math.random() - 0.5) * 0.05;
        }

        entity.vx += fx * params.speed;
        entity.vy += fy * params.speed;
        entity.vx *= 0.96;
        entity.vy *= 0.96;

        const sp = Math.sqrt(entity.vx ** 2 + entity.vy ** 2);
        const maxSpeed = recipe.speed * params.speed;
        if (sp > maxSpeed) {
          entity.vx = (entity.vx / sp) * maxSpeed;
          entity.vy = (entity.vy / sp) * maxSpeed;
        }

        entity.x += entity.vx;
        entity.y += entity.vy;

        if (entity.x < 0) entity.x = cssW;
        if (entity.x > cssW) entity.x = 0;
        if (entity.y < 0) entity.y = cssH;
        if (entity.y > cssH) entity.y = 0;
      }

      // Gas exchange and energy changes
      if (canBreathe) {
        if (recipe.consumes === 'OXYGEN') cell.oxygen -= activeMetabolism * 2;
        else cell.co2 -= activeMetabolism * 2;
        if (recipe.produces === 'OXYGEN') cell.oxygen += activeMetabolism * 3;
        else cell.co2 += activeMetabolism * 3;
        entity.energy -= activeMetabolism;
      } else {
        entity.energy -= activeMetabolism * 2;
      }

      let ate = false;
      if (recipe.preyOn && !entity.hibernating) {
        for (let j = entities.length - 1; j >= 0; j--) {
          if (i === j) continue;
          const prey = entities[j];
          if (recipe.preyOn.includes(prey.type)) {
            const dist = distance(entity.x, entity.y, prey.x, prey.y);
            if (dist < recipe.size + 2) {
              entity.energy = Math.min(100, entity.energy + 30);
              entity.timeSinceFed = 0;
              ate = true;
              // drop prey blocks
              for (let [blockType, amount] of Object.entries(prey.cellBlocks)) {
                for (let k = 0; k < amount; k++) {
                  blocks.push({
                    x: prey.x + (Math.random() - 0.5) * 10,
                    y: prey.y + (Math.random() - 0.5) * 10,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    type: blockType,
                    free: true,
                    age: 0
                  });
                }
              }
              entities.splice(j, 1);
              if (j < i) i--;
              break;
            }
          }
        }
      }

      if (!ate) entity.timeSinceFed++;

      // Reproduction
      if (entity.energy > 70 && entity.timeSinceFed < 50 && Math.random() < 0.002) {
        const child = {
          id: Math.random(),
          type: entity.type,
          x: entity.x + (Math.random() - 0.5) * 15,
          y: entity.y + (Math.random() - 0.5) * 15,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          energy: 60,
          age: 0,
          timeSinceFed: 0,
          hibernating: false,
          starvationResistance: entity.starvationResistance + (Math.random() - 0.5) * 20,
          metabolismRate: entity.metabolismRate * (0.95 + Math.random() * 0.1),
          cellBlocks: { ...entity.cellBlocks },
          extensions: []
        };
        entity.energy = 50;
        entities.push(child);
      }

      entity.age++;

      // Death
      if (entity.timeSinceFed > entity.starvationResistance && entity.energy <= 10) {
        for (let [blockType, amount] of Object.entries(entity.cellBlocks)) {
          for (let k = 0; k < amount; k++) {
            blocks.push({
              x: entity.x + (Math.random() - 0.5) * 10,
              y: entity.y + (Math.random() - 0.5) * 10,
              vx: (Math.random() - 0.5) * 0.5,
              vy: (Math.random() - 0.5) * 0.5,
              type: blockType,
              free: true,
              age: 0
            });
          }
        }
        entities.splice(i, 1);
      }
    }

    // Update stats (ensure numeric where expected)
    const typeCounts = {};
    const typeStats = {};
    let hibernating = 0;
    let totalEnergy = 0;
    let totalAge = 0;

    for (let e of entitiesRef.current) {
      typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
      if (e.hibernating) hibernating++;
      totalEnergy += e.energy;
      totalAge += e.age;

      if (!typeStats[e.type]) {
        typeStats[e.type] = {
          count: 0,
          avgEnergy: 0,
          avgAge: 0,
          avgStarvation: 0,
          avgMetabolism: 0
        };
      }

      typeStats[e.type].count++;
      typeStats[e.type].avgEnergy += e.energy;
      typeStats[e.type].avgAge += e.age;
      typeStats[e.type].avgStarvation += e.starvationResistance;
      typeStats[e.type].avgMetabolism += e.metabolismRate;
    }

    for (let type in typeStats) {
      const count = typeStats[type].count;
      typeStats[type].avgEnergy = count ? (typeStats[type].avgEnergy / count).toFixed(1) : 0;
      typeStats[type].avgAge = count ? Math.floor(typeStats[type].avgAge / count) : 0;
      typeStats[type].avgStarvation = count ? Math.floor(typeStats[type].avgStarvation / count) : 0;
      typeStats[type].avgMetabolism = count ? (typeStats[type].avgMetabolism / count).toFixed(3) : 0;
    }

    setStats({
      ...typeCounts,
      typeStats,
      blocks: buildingBlocksRef.current.filter(b => b.free).length,
      hibernating,
      totalOrganisms: entitiesRef.current.length,
      avgEnergy: entitiesRef.current.length > 0 ? (totalEnergy / entitiesRef.current.length).toFixed(1) : 0,
      avgAge: entitiesRef.current.length > 0 ? Math.floor(totalAge / entitiesRef.current.length) : 0
    });
  };

  // Render using transform: scale & pan applied, and DPR handled in transform
  const render = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const dpr = dprRef.current;
    const scale = scaleRef.current;
    const offset = offsetRef.current;

    // Clear full backing store first
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply combined transform: DPR and user zoom/pan
    // We want that one unit in our simulation = 1 CSS pixel on the canvas
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, offset.x * dpr, offset.y * dpr);

    // Draw background in world coordinates
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, cssW, cssH);

    const gasGrid = gasGridRef.current;
    if (gasGrid) {
      for (let y = 0; y < gasGrid.length; y++) {
        for (let x = 0; x < gasGrid[0].length; x++) {
          const cell = gasGrid[y][x];
          const oxygenAlpha = Math.floor((cell.oxygen / 100) * 30);
          const co2Alpha = Math.floor((cell.co2 / 100) * 30);
          ctx.fillStyle = `rgba(56, 189, 248, ${oxygenAlpha / 255})`;
          ctx.fillRect(x * GRID_CELL_SIZE, y * GRID_CELL_SIZE, GRID_CELL_SIZE, GRID_CELL_SIZE);
          ctx.fillStyle = `rgba(148, 163, 184, ${co2Alpha / 255})`;
          ctx.fillRect(x * GRID_CELL_SIZE, y * GRID_CELL_SIZE, GRID_CELL_SIZE / 2, GRID_CELL_SIZE / 2);
        }
      }
    }

    // Draw building blocks
    const blocks = buildingBlocksRef.current;
    for (let block of blocks) {
      if (!block.free) continue;
      const blockInfo = BLOCKS[block.type];
      ctx.beginPath();
      ctx.arc(block.x, block.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = blockInfo.color;
      ctx.fill();
    }

    // Draw entities
    const entities = entitiesRef.current;
    for (let entity of entities) {
      const recipe = ENTITY_RECIPES[entity.type];
      // draw cell blocks
      let blockIdx = 0;
      const totalBlocks = Object.values(entity.cellBlocks).reduce((a, b) => a + b, 0);
      for (let [blockType, amount] of Object.entries(entity.cellBlocks)) {
        const blockInfo = BLOCKS[blockType];
        for (let i = 0; i < amount; i++) {
          const angle = (Math.PI * 2 / totalBlocks) * blockIdx;
          const radius = recipe.size * 0.5;
          const bx = entity.x + Math.cos(angle) * radius;
          const by = entity.y + Math.sin(angle) * radius;
          ctx.beginPath();
          ctx.arc(bx, by, 2, 0, Math.PI * 2);
          ctx.fillStyle = blockInfo.color;
          ctx.fill();
          blockIdx++;
        }
      }
    }

    // Draw membranes and other decorations
    for (let entity of entities) {
      const recipe = ENTITY_RECIPES[entity.type];
      const opacity = entity.hibernating ? 0.4 : Math.max(0.6, entity.energy / 100);
      ctx.save();
      ctx.translate(entity.x, entity.y);
      const angle = Math.atan2(entity.vy, entity.vx);
      // strokeStyle with alpha: generate rgba from hex + alpha
      const hex = recipe.color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
      ctx.lineWidth = 2;
      ctx.fillStyle = 'transparent';

      switch (recipe.cellShape) {
        case 'hexagon': {
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i;
            const x = Math.cos(a) * recipe.size;
            const y = Math.sin(a) * recipe.size;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
          break;
        }
        case 'rod':
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.ellipse(0, 0, recipe.size * 1.5, recipe.size * 0.6, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'oval':
          ctx.beginPath();
          ctx.ellipse(0, 0, recipe.size * 1.2, recipe.size * 0.8, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'triangle':
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(recipe.size * 1.5, 0);
          ctx.lineTo(-recipe.size * 0.7, recipe.size * 0.9);
          ctx.lineTo(-recipe.size * 0.7, -recipe.size * 0.9);
          ctx.closePath();
          ctx.stroke();
          break;
        case 'irregular':
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 / 8) * i;
            const variation = 0.7 + Math.sin(entity.age * 0.1 + i) * 0.3;
            const x = Math.cos(a) * recipe.size * variation;
            const y = Math.sin(a) * recipe.size * variation;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
          break;
        default:
          ctx.beginPath();
          ctx.arc(0, 0, recipe.size, 0, Math.PI * 2);
          ctx.stroke();
      }

      if (entity.hibernating) {
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, recipe.size + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();

      if (entity.type === 'SLIME_MOLD' && !entity.hibernating && entity.energy > 50) {
        for (let i = 0; i < 4; i++) {
          const a = (Math.PI * 2 / 4) * i + entity.age * 0.02;
          const len = 6 + Math.sin(entity.age * 0.05 + i) * 3;
          ctx.beginPath();
          ctx.moveTo(entity.x, entity.y);
          ctx.lineTo(entity.x + Math.cos(a) * len, entity.y + Math.sin(a) * len);
          ctx.strokeStyle = recipe.color + '80';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    // Draw HUD / stats in screen space: reset transform and overlay host-space text
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Scale font by DPR so text remains crisp
    ctx.fillStyle = 'white';
    ctx.font = `${16 * dpr}px monospace`;
    let y = 24 * dpr;
    ctx.fillText('ECOSYSTEM STATS', 12 * dpr, y);
    y += 22 * dpr;
    ctx.fillStyle = '#a3a3a3';
    ctx.fillText(`Total Organisms: ${stats.totalOrganisms || 0}`, 12 * dpr, y);
    y += 18 * dpr;
    ctx.fillText(`Avg Energy: ${stats.avgEnergy || 0}`, 12 * dpr, y);
    y += 18 * dpr;
    ctx.fillText(`Avg Age: ${stats.avgAge || 0}`, 12 * dpr, y);
    y += 18 * dpr;
    ctx.fillStyle = '#60a5fa';
    ctx.fillText(`Hibernating: ${stats.hibernating || 0}`, 12 * dpr, y);
    y += 18 * dpr;
    ctx.fillStyle = '#84cc16';
    ctx.fillText(`Free Blocks: ${stats.blocks || 0}`, 12 * dpr, y);
  };

  // Main animation loop
  const animate = () => {
    if (isRunning) update();
    render();
    animationRef.current = requestAnimationFrame(animate);
  };

  // Resize canvas backing store based on container size and DPR
  const resizeCanvasBacking = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    const cssWidth = Math.max(100, container.clientWidth);
    const cssHeight = Math.max(100, container.clientHeight);
    // Set CSS size explicitly (so clientWidth/clientHeight are stable)
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    // Backing store
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    // ensure offset doesn't go out of bounds after resize
    clampOffset();
  };

  // Wheel -> zoom centered on cursor
  const onWheel = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
    const oldScale = scaleRef.current;
    let newScale = Math.min(4, Math.max(0.2, oldScale * zoomFactor));
    // zoom toward the cursor
    const worldX = (px - offsetRef.current.x) / oldScale;
    const worldY = (py - offsetRef.current.y) / oldScale;
    offsetRef.current.x = px - worldX * newScale;
    offsetRef.current.y = py - worldY * newScale;
    scaleRef.current = newScale;
    clampOffset();
  };

  // Mouse events for panning
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    isPanningRef.current = true;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: offsetRef.current.x,
      offsetY: offsetRef.current.y
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };
  const onMouseMove = (e) => {
    if (!isPanningRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    offsetRef.current.x = panStartRef.current.offsetX + dx;
    offsetRef.current.y = panStartRef.current.offsetY + dy;
    clampOffset();
  };
  const onMouseUp = () => {
    isPanningRef.current = false;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  // Reset view
  const resetView = () => {
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
  };

  // Effects: resize handling, init sim, and start animation
  useEffect(() => {
    const handleResize = () => {
      resizeCanvasBacking();
      // Re-init gas grid size to match new CSS dims
      initSimulation();
    };
    window.addEventListener('resize', handleResize);
    // Initial sizing
    resizeCanvasBacking();
    initSimulation();
    animate();
    // Pointer events on the canvas
    const canvas = canvasRef.current;
    canvas?.addEventListener('wheel', onWheel, { passive: false });
    canvas?.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationRef.current);
      canvas?.removeEventListener('wheel', onWheel, { passive: false });
      canvas?.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-init simulation when initialBlocks changes
  useEffect(() => {
    initSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.initialBlocks]);

  // UI handlers
  const toggleRunning = () => setIsRunning(r => !r);
  const onReset = () => {
    initSimulation();
  };

  return (
    <div className="w-full h-screen bg-gray-900 flex flex-col">
      <div className="bg-gray-800 p-3 border-b border-gray-700 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Cellular Life Formation Simulator</h1>
        <div className="flex items-center gap-2">
          <button onClick={toggleRunning} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-2">
            {isRunning ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play</>}
          </button>
          <button onClick={onReset} className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded flex items-center gap-2">
            <RotateCcw size={14} /> Reset
          </button>
          <div className="text-gray-300 text-sm ml-3">Use mouse wheel to zoom, click+drag to pan</div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Canvas container (left) */}
        <div ref={containerRef} className="flex-1 flex items-center justify-center bg-black" style={{ minWidth: 0 }}>
          <canvas
            ref={canvasRef}
            className="mx-auto"
            style={{
              // The canvas backing is sized programmatically, but ensure it doesn't overflow the container.
              display: 'block',
              maxWidth: '100%',
              maxHeight: '100%'
            }}
          />
        </div>

        {/* Settings panel (right) */}
        <aside className="w-80 bg-gray-800 border-l border-gray-700 p-4 overflow-auto">
          <h2 className="text-white font-semibold mb-3">Simulation Settings</h2>

          <div className="mb-4">
            <label className="text-gray-300 text-sm block mb-1">Building Blocks: {params.initialBlocks}</label>
            <input
              type="range"
              min="100"
              max="2000"
              value={params.initialBlocks}
              onChange={(e) => setParams({ ...params, initialBlocks: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>

          <div className="mb-4">
            <label className="text-gray-300 text-sm block mb-1">Attraction Range: {params.attractionRange}px</label>
            <input
              type="range"
              min="5"
              max="80"
              step="1"
              value={params.attractionRange}
              onChange={(e) => setParams({ ...params, attractionRange: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>

          <div className="mb-4">
            <label className="text-gray-300 text-sm block mb-1">Speed: {params.speed.toFixed(2)}x</label>
            <input
              type="range"
              min="0.05"
              max="2.0"
              step="0.01"
              value={params.speed}
              onChange={(e) => setParams({ ...params, speed: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>

          <div className="mb-4">
            <h3 className="text-gray-200 font-medium mb-2">View</h3>
            <div className="flex items-center gap-2 mb-2">
              <button
                title="Zoom in"
                onClick={() => {
                  const rect = canvasRef.current.getBoundingClientRect();
                  const cx = rect.width / 2;
                  const cy = rect.height / 2;
                  const world = screenToWorld(rect.left + cx, rect.top + cy);
                  scaleRef.current = Math.min(4, scaleRef.current * 1.2);
                  offsetRef.current.x = cx - world.x * scaleRef.current;
                  offsetRef.current.y = cy - world.y * scaleRef.current;
                  clampOffset();
                }}
                className="px-2 py-1 bg-gray-700 text-white rounded flex items-center gap-2"
              >
                <ZoomIn size={14} /> Zoom In
              </button>
              <button
                title="Zoom out"
                onClick={() => {
                  const rect = canvasRef.current.getBoundingClientRect();
                  const cx = rect.width / 2;
                  const cy = rect.height / 2;
                  const world = screenToWorld(rect.left + cx, rect.top + cy);
                  scaleRef.current = Math.max(0.2, scaleRef.current * 0.8);
                  offsetRef.current.x = cx - world.x * scaleRef.current;
                  offsetRef.current.y = cy - world.y * scaleRef.current;
                  clampOffset();
                }}
                className="px-2 py-1 bg-gray-700 text-white rounded flex items-center gap-2"
              >
                <ZoomOut size={14} /> Zoom Out
              </button>
              <button
                title="Reset view"
                onClick={resetView}
                className="px-2 py-1 bg-gray-700 text-white rounded flex items-center gap-2"
              >
                <Move size={14} /> Reset View
              </button>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-gray-200 font-medium mb-2">Simulation Stats</h3>
            <div className="text-gray-300 text-sm space-y-1">
              <div>Total Organisms: <span className="text-white">{stats.totalOrganisms || 0}</span></div>
              <div>Avg Energy: <span className="text-white">{stats.avgEnergy || 0}</span></div>
              <div>Avg Age: <span className="text-white">{stats.avgAge || 0}</span></div>
              <div>Hibernating: <span className="text-white">{stats.hibernating || 0}</span></div>
              <div>Free Blocks: <span className="text-white">{stats.blocks || 0}</span></div>
            </div>

            <div className="mt-4">
              <h4 className="text-gray-200 font-medium mb-2">Species Details</h4>
              <div className="text-gray-300 text-sm space-y-2 max-h-48 overflow-auto">
                {Object.entries(stats.typeStats || {}).length === 0 && (
                  <div className="text-gray-500">No species yet</div>
                )}
                {Object.entries(stats.typeStats || {}).map(([type, data]) => {
                  const recipe = ENTITY_RECIPES[type];
                  if (!recipe) return null;
                  return (
                    <div key={type} className="p-2 bg-gray-700 rounded">
                      <div className="font-semibold" style={{ color: recipe.color }}>{recipe.name}</div>
                      <div className="text-xs text-gray-300">Count: {stats[type] || 0}</div>
                      <div className="text-xs text-gray-300">Energy: {data.avgEnergy}</div>
                      <div className="text-xs text-gray-300">Age: {data.avgAge}</div>
                      <div className="text-xs text-gray-300">Starve: {data.avgStarvation}</div>
                      <div className="text-xs text-gray-300">Metab: {data.avgMetabolism}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default EcosystemSimulator;
