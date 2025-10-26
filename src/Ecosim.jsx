import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut, Move, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Enhanced Ecosystem Simulator with:
 * - 80/20 split: canvas (80% width) and settings panel (20% width)
 * - Smooth organism membranes containing visible building blocks
 * - Expanded building block types with compatibility system
 * - Professional settings GUI with collapsible sections
 * - Enhanced zoom & pan controls with sensitivity adjustment
 * - Stats display at bottom of settings panel
 */

const EcosystemSimulator = () => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  const entitiesRef = useRef([]);
  const buildingBlocksRef = useRef([]);
  const gasGridRef = useRef(null);

  const [isRunning, setIsRunning] = useState(true);
  const [stats, setStats] = useState({});
  const [params, setParams] = useState({
    initialBlocks: 800,
    speed: 0.4,
    attractionRange: 12,
    zoomSensitivity: 1.0,
    panSensitivity: 1.0
  });
  
  const [collapsedSections, setCollapsedSections] = useState({
    simulation: false,
    view: false,
    stats: false,
    species: false
  });

  const dprRef = useRef(window.devicePixelRatio || 1);
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  const GRID_CELL_SIZE = 40;

  // Expanded building block types with functional abilities
  const BLOCKS = {
    NUTRIENT: { color: '#84cc16', mass: 1, category: 'energy' },
    CARBON: { color: '#78716c', mass: 1, category: 'structure' },
    PROTEIN: { color: '#ec4899', mass: 1, category: 'structure' },
    MEAT_EATER: { color: '#ef4444', mass: 1, category: 'diet' },
    VEGETATION_EATER: { color: '#22c55e', mass: 1, category: 'diet' },
    MOVEMENT: { color: '#3b82f6', mass: 1, category: 'locomotion' },
    SENSOR: { color: '#a855f7', mass: 1, category: 'perception' },
    VISION: { color: '#f59e0b', mass: 1, category: 'perception' },
    AIR_BREATHER: { color: '#06b6d4', mass: 1, category: 'respiration' },
    WATER_BREATHER: { color: '#0ea5e9', mass: 1, category: 'respiration' },
    OXYGEN_PRODUCER: { color: '#10b981', mass: 1, category: 'gas_exchange' },
    CO2_PRODUCER: { color: '#64748b', mass: 1, category: 'gas_exchange' }
  };

  // Building block compatibility chart - defines which blocks can combine
  const BLOCK_COMPATIBILITY = {
    // Respiration types are mutually exclusive
    AIR_BREATHER: ['NUTRIENT', 'CARBON', 'PROTEIN', 'MEAT_EATER', 'VEGETATION_EATER', 'MOVEMENT', 'SENSOR', 'VISION', 'OXYGEN_PRODUCER', 'CO2_PRODUCER'],
    WATER_BREATHER: ['NUTRIENT', 'CARBON', 'PROTEIN', 'MEAT_EATER', 'VEGETATION_EATER', 'MOVEMENT', 'SENSOR', 'VISION', 'OXYGEN_PRODUCER', 'CO2_PRODUCER'],
    // Diet types can coexist
    MEAT_EATER: ['NUTRIENT', 'CARBON', 'PROTEIN', 'VEGETATION_EATER', 'MOVEMENT', 'SENSOR', 'VISION', 'AIR_BREATHER', 'WATER_BREATHER', 'OXYGEN_PRODUCER', 'CO2_PRODUCER'],
    VEGETATION_EATER: ['NUTRIENT', 'CARBON', 'PROTEIN', 'MEAT_EATER', 'MOVEMENT', 'SENSOR', 'VISION', 'AIR_BREATHER', 'WATER_BREATHER', 'OXYGEN_PRODUCER', 'CO2_PRODUCER'],
    // Basic blocks compatible with all
    NUTRIENT: Object.keys(BLOCKS).filter(k => k !== 'NUTRIENT'),
    CARBON: Object.keys(BLOCKS).filter(k => k !== 'CARBON'),
    PROTEIN: Object.keys(BLOCKS).filter(k => k !== 'PROTEIN'),
    MOVEMENT: Object.keys(BLOCKS).filter(k => k !== 'MOVEMENT'),
    SENSOR: Object.keys(BLOCKS).filter(k => k !== 'SENSOR'),
    VISION: Object.keys(BLOCKS).filter(k => k !== 'VISION'),
    OXYGEN_PRODUCER: Object.keys(BLOCKS).filter(k => k !== 'OXYGEN_PRODUCER'),
    CO2_PRODUCER: Object.keys(BLOCKS).filter(k => k !== 'CO2_PRODUCER')
  };

  // Updated entity recipes with new building blocks
  const ENTITY_RECIPES = {
    SLIME_MOLD: {
      name: 'Slime Mold',
      color: '#fbbf24',
      requires: { NUTRIENT: 3, CARBON: 2, VEGETATION_EATER: 1 },
      size: 3,
      speed: 0.15,
      metabolism: 0.02,
      starvationTime: 300,
      produces: 'OXYGEN',
      consumes: 'CO2',
      preyOn: [],
      canHibernate: true,
      membraneShape: 'capsule',
      smoothness: 0.9
    },
    ALGAE: {
      name: 'Algae',
      color: '#22c55e',
      requires: { NUTRIENT: 2, CARBON: 2, OXYGEN_PRODUCER: 1, WATER_BREATHER: 1 },
      size: 2,
      speed: 0.05,
      metabolism: 0.015,
      starvationTime: 400,
      produces: 'OXYGEN',
      consumes: 'CO2',
      preyOn: [],
      canHibernate: true,
      membraneShape: 'hexagon',
      smoothness: 0.8
    },
    BACTERIA: {
      name: 'Bacteria',
      color: '#ec4899',
      requires: { NUTRIENT: 2, PROTEIN: 1, MEAT_EATER: 1, MOVEMENT: 1 },
      size: 2,
      speed: 0.3,
      metabolism: 0.04,
      starvationTime: 200,
      produces: 'CO2',
      consumes: 'OXYGEN',
      preyOn: ['SLIME_MOLD'],
      canHibernate: true,
      membraneShape: 'rod',
      smoothness: 1.0
    },
    PROTOZOA: {
      name: 'Protozoa',
      color: '#8b5cf6',
      requires: { NUTRIENT: 3, PROTEIN: 2, CARBON: 1, SENSOR: 1, MOVEMENT: 1 },
      size: 3,
      speed: 0.25,
      metabolism: 0.05,
      starvationTime: 250,
      produces: 'CO2',
      consumes: 'OXYGEN',
      preyOn: ['BACTERIA', 'ALGAE'],
      canHibernate: true,
      membraneShape: 'oval',
      smoothness: 0.95
    },
    PREDATOR: {
      name: 'Predator',
      color: '#ef4444',
      requires: { PROTEIN: 3, CARBON: 2, MEAT_EATER: 2, VISION: 1, MOVEMENT: 1 },
      size: 4,
      speed: 0.4,
      metabolism: 0.08,
      starvationTime: 180,
      produces: 'CO2',
      consumes: 'OXYGEN',
      preyOn: ['PROTOZOA', 'BACTERIA'],
      canHibernate: true,
      membraneShape: 'triangle',
      smoothness: 0.85
    }
  };

  const getCSSWidth = () => canvasRef.current?.clientWidth || 0;
  const getCSSHeight = () => canvasRef.current?.clientHeight || 0;

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

  // Check if building blocks are compatible
  const areBlocksCompatible = (blockTypes) => {
    for (let i = 0; i < blockTypes.length; i++) {
      for (let j = i + 1; j < blockTypes.length; j++) {
        const type1 = blockTypes[i];
        const type2 = blockTypes[j];
        if (!BLOCK_COMPATIBILITY[type1]?.includes(type2)) {
          return false;
        }
      }
    }
    return true;
  };

  const initSimulation = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;

    dprRef.current = window.devicePixelRatio || 1;
    gasGridRef.current = initGasGrid(cssWidth, cssHeight);

    const blocks = [];
    const blockTypes = Object.keys(BLOCKS);
    for (let i = 0; i < params.initialBlocks; i++) {
      const type = blockTypes[Math.floor(Math.random() * blockTypes.length)];
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
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
  };

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
      const requiredTypes = Object.keys(recipe.requires);
      
      // Check if we have enough of each type
      for (let [blockType, amount] of Object.entries(recipe.requires)) {
        if ((available[blockType] || 0) < amount) {
          canForm = false;
          break;
        }
      }

      // Check compatibility
      if (canForm && !areBlocksCompatible(requiredTypes)) {
        canForm = false;
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

      if (block.x < 0) block.x = cssW;
      if (block.x > cssW) block.x = 0;
      if (block.y < 0) block.y = cssH;
      if (block.y > cssH) block.y = 0;
      block.age++;
    }

    const newEntity = tryFormEntity(blocks, canvas);
    if (newEntity) entities.push(newEntity);

    // Update entities
    for (let i = entities.length - 1; i >= 0; i--) {
      const entity = entities[i];
      const recipe = ENTITY_RECIPES[entity.type];
      const col = Math.floor(entity.x / GRID_CELL_SIZE);
      const row = Math.floor(entity.y / GRID_CELL_SIZE);
      const cell = (row >= 0 && row < gasGrid.length && col >= 0 && col < gasGrid[0].length) 
        ? gasGrid[row][col] 
        : null;

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

      // Gas exchange
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

    // Update stats
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

  // Draw smooth membrane shapes
  const drawSmoothMembrane = (ctx, entity, recipe) => {
    const smoothness = recipe.smoothness || 0.8;
    const angle = Math.atan2(entity.vy, entity.vx);
    
    ctx.save();
    ctx.translate(entity.x, entity.y);
    
    const hex = recipe.color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const opacity = entity.hibernating ? 0.4 : Math.max(0.6, entity.energy / 100);
    
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    switch (recipe.membraneShape) {
      case 'capsule':
        ctx.rotate(angle);
        ctx.beginPath();
        const capsuleLength = recipe.size * 1.8;
        const capsuleRadius = recipe.size * 0.7;
        ctx.arc(-capsuleLength/2, 0, capsuleRadius, Math.PI/2, Math.PI * 3/2);
        ctx.lineTo(capsuleLength/2, -capsuleRadius);
        ctx.arc(capsuleLength/2, 0, capsuleRadius, -Math.PI/2, Math.PI/2);
        ctx.lineTo(-capsuleLength/2, capsuleRadius);
        ctx.closePath();
        ctx.stroke();
        break;
        
      case 'hexagon':
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i;
          const nextA = (Math.PI / 3) * (i + 1);
          const x1 = Math.cos(a) * recipe.size;
          const y1 = Math.sin(a) * recipe.size;
          const x2 = Math.cos(nextA) * recipe.size;
          const y2 = Math.sin(nextA) * recipe.size;
          
          if (i === 0) ctx.moveTo(x1, y1);
          
          const cpx = (x1 + x2) / 2 * (1 + smoothness * 0.1);
          const cpy = (y1 + y2) / 2 * (1 + smoothness * 0.1);
          ctx.quadraticCurveTo(cpx, cpy, x2, y2);
        }
        ctx.closePath();
        ctx.stroke();
        break;
        
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
        const points = [
          { x: recipe.size * 1.5, y: 0 },
          { x: -recipe.size * 0.7, y: recipe.size * 0.9 },
          { x: -recipe.size * 0.7, y: -recipe.size * 0.9 }
        ];
        
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length; i++) {
          const curr = points[i];
          const next = points[(i + 1) % points.length];
          const cp1x = curr.x * (1 - smoothness * 0.3);
          const cp1y = curr.y * (1 - smoothness * 0.3);
          const cp2x = next.x * (1 - smoothness * 0.3);
          const cp2y = next.y * (1 - smoothness * 0.3);
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, next.x, next.y);
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
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, recipe.size + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    ctx.restore();
  };

  const render = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const dpr = dprRef.current;
    const scale = scaleRef.current;
    const offset = offsetRef.current;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, offset.x * dpr, offset.y * dpr);

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

    // Draw free building blocks
    const blocks = buildingBlocksRef.current;
    for (let block of blocks) {
      if (!block.free) continue;
      const blockInfo = BLOCKS[block.type];
      ctx.beginPath();
      ctx.arc(block.x, block.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = blockInfo.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    const entities = entitiesRef.current;
    
    // Draw building blocks inside organisms
    for (let entity of entities) {
      const recipe = ENTITY_RECIPES[entity.type];
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
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
          blockIdx++;
        }
      }
    }

    // Draw smooth membranes
    for (let entity of entities) {
      const recipe = ENTITY_RECIPES[entity.type];
      drawSmoothMembrane(ctx, entity, recipe);
    }
  };

  const animate = () => {
    if (isRunning) update();
    render();
    animationRef.current = requestAnimationFrame(animate);
  };

  const resizeCanvasBacking = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    const cssWidth = Math.max(100, container.clientWidth);
    const cssHeight = Math.max(100, container.clientHeight);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    clampOffset();
  };

  const onWheel = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const zoomFactor = (e.deltaY < 0 ? 1.12 : 0.88) * params.zoomSensitivity;
    const oldScale = scaleRef.current;
    let newScale = Math.min(4, Math.max(0.2, oldScale * zoomFactor));
    const worldX = (px - offsetRef.current.x) / oldScale;
    const worldY = (py - offsetRef.current.y) / oldScale;
    offsetRef.current.x = px - worldX * newScale;
    offsetRef.current.y = py - worldY * newScale;
    scaleRef.current = newScale;
    clampOffset();
  };

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
    const dx = (e.clientX - panStartRef.current.x) * params.panSensitivity;
    const dy = (e.clientY - panStartRef.current.y) * params.panSensitivity;
    offsetRef.current.x = panStartRef.current.offsetX + dx;
    offsetRef.current.y = panStartRef.current.offsetY + dy;
    clampOffset();
  };
  
  const onMouseUp = () => {
    isPanningRef.current = false;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  const resetView = () => {
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
  };

  useEffect(() => {
    const handleResize = () => {
      resizeCanvasBacking();
      initSimulation();
    };
    window.addEventListener('resize', handleResize);
    resizeCanvasBacking();
    initSimulation();
    animate();
    const canvas = canvasRef.current;
    canvas?.addEventListener('wheel', onWheel, { passive: false });
    canvas?.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationRef.current);
      canvas?.removeEventListener('wheel', onWheel);
      canvas?.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  useEffect(() => {
    initSimulation();
  }, [params.initialBlocks]);

  const toggleRunning = () => setIsRunning(r => !r);
  const onReset = () => initSimulation();
  const toggleSection = (section) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="w-full h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-4 border-b border-gray-700 shadow-lg">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white tracking-tight">Cellular Life Formation Simulator</h1>
          <div className="flex items-center gap-3">
            <button 
              onClick={toggleRunning} 
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-all shadow-md hover:shadow-lg"
            >
              {isRunning ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Play</>}
            </button>
            <button 
              onClick={onReset} 
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center gap-2 transition-all shadow-md hover:shadow-lg"
            >
              <RotateCcw size={16} /> Reset
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Canvas container - 80% width */}
        <div ref={containerRef} className="flex-1 bg-black" style={{ width: '80%' }}>
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ display: 'block' }}
          />
        </div>

        {/* Settings panel - 20% width */}
        <aside className="bg-gradient-to-b from-gray-800 to-gray-900 border-l border-gray-700 overflow-y-auto" style={{ width: '20%', minWidth: '280px' }}>
          <div className="p-5 space-y-4">
            
            {/* Simulation Settings Section */}
            <div className="bg-gray-700/50 rounded-lg p-4 shadow-md border border-gray-600">
              <button 
                onClick={() => toggleSection('simulation')}
                className="w-full flex items-center justify-between text-white font-semibold mb-3 hover:text-blue-400 transition-colors"
              >
                <span className="text-sm uppercase tracking-wide">Simulation</span>
                {collapsedSections.simulation ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
              </button>
              
              {!collapsedSections.simulation && (
                <div className="space-y-4">
                  <div>
                    <label className="text-gray-300 text-xs font-medium block mb-2">
                      Building Blocks: <span className="text-white font-bold">{params.initialBlocks}</span>
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="2000"
                      value={params.initialBlocks}
                      onChange={(e) => setParams({ ...params, initialBlocks: parseInt(e.target.value) })}
                      className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-gray-300 text-xs font-medium block mb-2">
                      Attraction Range: <span className="text-white font-bold">{params.attractionRange}px</span>
                    </label>
                    <input
                      type="range"
                      min="5"
                      max="80"
                      step="1"
                      value={params.attractionRange}
                      onChange={(e) => setParams({ ...params, attractionRange: parseInt(e.target.value) })}
                      className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-gray-300 text-xs font-medium block mb-2">
                      Speed: <span className="text-white font-bold">{params.speed.toFixed(2)}x</span>
                    </label>
                    <input
                      type="range"
                      min="0.05"
                      max="2.0"
                      step="0.01"
                      value={params.speed}
                      onChange={(e) => setParams({ ...params, speed: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* View Controls Section */}
            <div className="bg-gray-700/50 rounded-lg p-4 shadow-md border border-gray-600">
              <button 
                onClick={() => toggleSection('view')}
                className="w-full flex items-center justify-between text-white font-semibold mb-3 hover:text-blue-400 transition-colors"
              >
                <span className="text-sm uppercase tracking-wide">View Controls</span>
                {collapsedSections.view ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
              </button>
              
              {!collapsedSections.view && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        const rect = canvasRef.current?.getBoundingClientRect();
                        if (!rect) return;
                        const cx = rect.width / 2;
                        const cy = rect.height / 2;
                        const world = screenToWorld(rect.left + cx, rect.top + cy);
                        scaleRef.current = Math.min(4, scaleRef.current * 1.2);
                        offsetRef.current.x = cx - world.x * scaleRef.current;
                        offsetRef.current.y = cy - world.y * scaleRef.current;
                        clampOffset();
                      }}
                      className="px-2 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg flex items-center justify-center gap-1 text-xs transition-all"
                      title="Zoom In"
                    >
                      <ZoomIn size={14} />
                    </button>
                    <button
                      onClick={() => {
                        const rect = canvasRef.current?.getBoundingClientRect();
                        if (!rect) return;
                        const cx = rect.width / 2;
                        const cy = rect.height / 2;
                        const world = screenToWorld(rect.left + cx, rect.top + cy);
                        scaleRef.current = Math.max(0.2, scaleRef.current * 0.8);
                        offsetRef.current.x = cx - world.x * scaleRef.current;
                        offsetRef.current.y = cy - world.y * scaleRef.current;
                        clampOffset();
                      }}
                      className="px-2 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg flex items-center justify-center gap-1 text-xs transition-all"
                      title="Zoom Out"
                    >
                      <ZoomOut size={14} />
                    </button>
                    <button
                      onClick={resetView}
                      className="px-2 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg flex items-center justify-center gap-1 text-xs transition-all"
                      title="Reset View"
                    >
                      <Move size={14} />
                    </button>
                  </div>

                  <div>
                    <label className="text-gray-300 text-xs font-medium block mb-2">
                      Zoom Sensitivity: <span className="text-white font-bold">{params.zoomSensitivity.toFixed(2)}</span>
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={params.zoomSensitivity}
                      onChange={(e) => setParams({ ...params, zoomSensitivity: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-gray-300 text-xs font-medium block mb-2">
                      Pan Sensitivity: <span className="text-white font-bold">{params.panSensitivity.toFixed(2)}</span>
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={params.panSensitivity}
                      onChange={(e) => setParams({ ...params, panSensitivity: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div className="text-gray-400 text-xs bg-gray-800/50 p-2 rounded">
                    <p>🖱️ Scroll to zoom</p>
                    <p>🖱️ Click & drag to pan</p>
                  </div>
                </div>
              )}
            </div>

            {/* Stats Section */}
            <div className="bg-gray-700/50 rounded-lg p-4 shadow-md border border-gray-600">
              <button 
                onClick={() => toggleSection('stats')}
                className="w-full flex items-center justify-between text-white font-semibold mb-3 hover:text-blue-400 transition-colors"
              >
                <span className="text-sm uppercase tracking-wide">Statistics</span>
                {collapsedSections.stats ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
              </button>
              
              {!collapsedSections.stats && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center py-1 border-b border-gray-600">
                    <span className="text-gray-300">Total Organisms:</span>
                    <span className="text-white font-bold">{stats.totalOrganisms || 0}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-600">
                    <span className="text-gray-300">Avg Energy:</span>
                    <span className="text-green-400 font-bold">{stats.avgEnergy || 0}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-600">
                    <span className="text-gray-300">Avg Age:</span>
                    <span className="text-blue-400 font-bold">{stats.avgAge || 0}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-600">
                    <span className="text-gray-300">Hibernating:</span>
                    <span className="text-cyan-400 font-bold">{stats.hibernating || 0}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-gray-300">Free Blocks:</span>
                    <span className="text-lime-400 font-bold">{stats.blocks || 0}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Species Details Section */}
            <div className="bg-gray-700/50 rounded-lg p-4 shadow-md border border-gray-600">
              <button 
                onClick={() => toggleSection('species')}
                className="w-full flex items-center justify-between text-white font-semibold mb-3 hover:text-blue-400 transition-colors"
              >
                <span className="text-sm uppercase tracking-wide">Species Details</span>
                {collapsedSections.species ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
              </button>
              
              {!collapsedSections.species && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {Object.entries(stats.typeStats || {}).length === 0 && (
                    <div className="text-gray-500 text-sm text-center py-4">No species yet</div>
                  )}
                  {Object.entries(stats.typeStats || {}).map(([type, data]) => {
                    const recipe = ENTITY_RECIPES[type];
                    if (!recipe) return null;
                    return (
                      <div key={type} className="bg-gray-800/70 rounded-lg p-3 border border-gray-600">
                        <div className="font-bold text-sm mb-2" style={{ color: recipe.color }}>
                          {recipe.name}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="text-gray-400">Count: <span className="text-white">{stats[type] || 0}</span></div>
                          <div className="text-gray-400">Energy: <span className="text-white">{data.avgEnergy}</span></div>
                          <div className="text-gray-400">Age: <span className="text-white">{data.avgAge}</span></div>
                          <div className="text-gray-400">Starve: <span className="text-white">{data.avgStarvation}</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </aside>
      </div>
    </div>
  );
};

export default EcosystemSimulator;