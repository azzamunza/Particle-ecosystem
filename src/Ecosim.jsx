import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut, Move } from 'lucide-react';

const EcosystemSimulator = () => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
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
    zoomSensitivity: 0.1,
    panSensitivity: 1.0
  });
  
  const [camera, setCamera] = useState({
    x: 0,
    y: 0,
    zoom: 1,
    isDragging: false,
    lastX: 0,
    lastY: 0
  });

  const GRID_CELL_SIZE = 40;

  // Building block types with specific functionalities
  const BLOCK_TYPES = {
    // Energy & Metabolism
    NUTRIENT: { color: '#84cc16', symbol: 'N', function: 'energy_source' },
    CARBON: { color: '#78716c', symbol: 'C', function: 'structure' },
    PROTEIN: { color: '#ec4899', symbol: 'P', function: 'structure' },
    
    // Movement
    LOCOMOTION: { color: '#06b6d4', symbol: 'L', function: 'movement' },
    
    // Sensing
    PHOTORECEPTOR: { color: '#fbbf24', symbol: 'E', function: 'vision' },
    CHEMORECEPTOR: { color: '#a855f7', symbol: 'S', function: 'sensing' },
    
    // Feeding
    HERBIVORE_ENZYME: { color: '#22c55e', symbol: 'H', function: 'eat_vegetation' },
    CARNIVORE_ENZYME: { color: '#ef4444', symbol: 'M', function: 'eat_meat' },
    
    // Respiration
    AEROBIC: { color: '#38bdf8', symbol: 'A', function: 'breathe_air' },
    AQUATIC: { color: '#0ea5e9', symbol: 'W', function: 'breathe_water' },
    
    // Production
    CHLOROPLAST: { color: '#10b981', symbol: 'O', function: 'produce_oxygen' },
    MITOCHONDRIA: { color: '#94a3b8', symbol: 'D', function: 'produce_co2' }
  };

  // Compatibility chart - which blocks can work together
  const BLOCK_COMPATIBILITY = {
    // Respiration compatibility
    AEROBIC: ['MITOCHONDRIA', 'CARNIVORE_ENZYME', 'LOCOMOTION', 'PHOTORECEPTOR', 'CHEMORECEPTOR'],
    AQUATIC: ['CHLOROPLAST', 'HERBIVORE_ENZYME', 'LOCOMOTION', 'CHEMORECEPTOR'],
    
    // Feeding compatibility
    HERBIVORE_ENZYME: ['CHLOROPLAST', 'NUTRIENT', 'AQUATIC', 'LOCOMOTION'],
    CARNIVORE_ENZYME: ['MITOCHONDRIA', 'PROTEIN', 'AEROBIC', 'LOCOMOTION', 'PHOTORECEPTOR'],
    
    // Production compatibility
    CHLOROPLAST: ['HERBIVORE_ENZYME', 'NUTRIENT', 'CARBON', 'AQUATIC'],
    MITOCHONDRIA: ['CARNIVORE_ENZYME', 'PROTEIN', 'AEROBIC', 'LOCOMOTION'],
    
    // Movement works with most
    LOCOMOTION: ['AEROBIC', 'AQUATIC', 'CARNIVORE_ENZYME', 'HERBIVORE_ENZYME', 'PHOTORECEPTOR', 'CHEMORECEPTOR'],
    
    // Sensing
    PHOTORECEPTOR: ['AEROBIC', 'CARNIVORE_ENZYME', 'LOCOMOTION'],
    CHEMORECEPTOR: ['AEROBIC', 'AQUATIC', 'HERBIVORE_ENZYME', 'CARNIVORE_ENZYME', 'LOCOMOTION']
  };

  // Organism archetypes based on block combinations
  const ORGANISM_ARCHETYPES = {
    PHOTOSYNTHETIC_ALGAE: {
      name: 'Photosynthetic Algae',
      color: '#22c55e',
      requires: { NUTRIENT: 3, CHLOROPLAST: 2, AQUATIC: 1, CARBON: 2 },
      shape: 'rounded_rect',
      size: 8,
      speed: 0.05,
      metabolism: 0.015,
      starvationTime: 400
    },
    HERBIVORE_ZOOPLANKTON: {
      name: 'Herbivore Zooplankton',
      color: '#06b6d4',
      requires: { HERBIVORE_ENZYME: 2, LOCOMOTION: 2, AQUATIC: 1, CHEMORECEPTOR: 1 },
      shape: 'capsule',
      size: 7,
      speed: 0.25,
      metabolism: 0.03,
      starvationTime: 250
    },
    AEROBIC_BACTERIA: {
      name: 'Aerobic Bacteria',
      color: '#ec4899',
      requires: { PROTEIN: 2, MITOCHONDRIA: 2, AEROBIC: 1, LOCOMOTION: 1 },
      shape: 'capsule',
      size: 6,
      speed: 0.3,
      metabolism: 0.04,
      starvationTime: 200
    },
    PREDATORY_PROTOZOA: {
      name: 'Predatory Protozoa',
      color: '#8b5cf6',
      requires: { CARNIVORE_ENZYME: 3, PHOTORECEPTOR: 2, AEROBIC: 2, LOCOMOTION: 2 },
      shape: 'rounded_triangle',
      size: 9,
      speed: 0.35,
      metabolism: 0.05,
      starvationTime: 220
    },
    APEX_PREDATOR: {
      name: 'Apex Predator',
      color: '#ef4444',
      requires: { CARNIVORE_ENZYME: 4, PHOTORECEPTOR: 3, AEROBIC: 3, LOCOMOTION: 3, PROTEIN: 2 },
      shape: 'sharp_triangle',
      size: 12,
      speed: 0.45,
      metabolism: 0.08,
      starvationTime: 180
    }
  };

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

  const getGridCell = (x, y, grid) => {
    const col = Math.floor(x / GRID_CELL_SIZE);
    const row = Math.floor(y / GRID_CELL_SIZE);
    if (row >= 0 && row < grid.length && col >= 0 && col < grid[0].length) {
      return grid[row][col];
    }
    return null;
  };

  const initSimulation = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    gasGridRef.current = initGasGrid(canvas.width, canvas.height);

    const blocks = [];
    const blockTypes = Object.keys(BLOCK_TYPES);
    for (let i = 0; i < params.initialBlocks; i++) {
      const type = blockTypes[Math.floor(Math.random() * blockTypes.length)];
      blocks.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        type: type,
        free: true,
        age: 0
      });
    }
    buildingBlocksRef.current = blocks;
    entitiesRef.current = [];
  };

  const checkCompatibility = (blocks) => {
    // Check if all blocks are compatible with each other
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const type1 = blocks[i];
        const type2 = blocks[j];
        
        const compat1 = BLOCK_COMPATIBILITY[type1] || [];
        const compat2 = BLOCK_COMPATIBILITY[type2] || [];
        
        if (!compat1.includes(type2) && !compat2.includes(type1)) {
          return false; // Incompatible blocks
        }
      }
    }
    return true;
  };

  const tryFormEntity = (blocks, canvas) => {
    for (let [archetypeKey, archetype] of Object.entries(ORGANISM_ARCHETYPES)) {
      if (Math.random() > 0.001) continue;

      const startIdx = Math.floor(Math.random() * blocks.length);
      const startBlock = blocks[startIdx];
      
      const nearby = [];
      const range = 35;
      
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (!block.free) continue;
        
        const dx = block.x - startBlock.x;
        const dy = block.y - startBlock.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < range) {
          nearby.push({ block, index: i });
        }
      }

      const available = {};
      const indices = [];
      
      for (let item of nearby) {
        available[item.block.type] = (available[item.block.type] || 0) + 1;
        indices.push(item.index);
      }

      let canForm = true;
      for (let [blockType, amount] of Object.entries(archetype.requires)) {
        if ((available[blockType] || 0) < amount) {
          canForm = false;
          break;
        }
      }

      if (canForm) {
        // Check compatibility
        const blockTypesInEntity = Object.keys(archetype.requires);
        if (!checkCompatibility(blockTypesInEntity)) {
          continue; // Skip if incompatible
        }

        let cx = 0, cy = 0, count = 0;
        const toRemove = [];
        const cellBlocks = [];
        
        for (let [blockType, amount] of Object.entries(archetype.requires)) {
          let found = 0;
          for (let i = indices.length - 1; i >= 0; i--) {
            const idx = indices[i];
            if (blocks[idx].type === blockType && found < amount) {
              cx += blocks[idx].x;
              cy += blocks[idx].y;
              count++;
              cellBlocks.push({ type: blockType, relX: 0, relY: 0 });
              toRemove.push(idx);
              found++;
            }
          }
        }

        cx /= count;
        cy /= count;

        toRemove.sort((a, b) => b - a);
        for (let idx of toRemove) {
          blocks.splice(idx, 1);
        }

        // Arrange blocks in a pattern inside the cell
        for (let i = 0; i < cellBlocks.length; i++) {
          const angle = (Math.PI * 2 / cellBlocks.length) * i;
          const radius = archetype.size * 0.4;
          cellBlocks[i].relX = Math.cos(angle) * radius;
          cellBlocks[i].relY = Math.sin(angle) * radius;
        }

        return {
          id: Math.random(),
          type: archetypeKey,
          x: cx,
          y: cy,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          energy: 100,
          age: 0,
          timeSinceFed: 0,
          hibernating: false,
          starvationResistance: archetype.starvationTime,
          metabolismRate: archetype.metabolism,
          cellBlocks: cellBlocks,
          archetype: archetype
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

    const entities = entitiesRef.current;
    const blocks = buildingBlocksRef.current;
    const gasGrid = gasGridRef.current;

    // Diffuse gases
    for (let y = 0; y < gasGrid.length; y++) {
      for (let x = 0; x < gasGrid[0].length; x++) {
        const cell = gasGrid[y][x];
        let oxygenDiff = 0, co2Diff = 0, neighbors = 0;
        
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const ny = y + dy, nx = x + dx;
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
      
      if (block.x < 0) block.x = canvas.width;
      if (block.x > canvas.width) block.x = 0;
      if (block.y < 0) block.y = canvas.height;
      if (block.y > canvas.height) block.y = 0;
      
      block.age++;
    }

    const newEntity = tryFormEntity(blocks, canvas);
    if (newEntity) entities.push(newEntity);

    // Update entities
    for (let i = entities.length - 1; i >= 0; i--) {
      const entity = entities[i];
      const archetype = entity.archetype;
      const cell = getGridCell(entity.x, entity.y, gasGrid);
      if (!cell) continue;

      // Determine respiration needs
      const hasAerobic = entity.cellBlocks.some(b => b.type === 'AEROBIC');
      const hasAquatic = entity.cellBlocks.some(b => b.type === 'AQUATIC');
      const canBreathe = hasAerobic ? cell.oxygen > 10 : hasAquatic ? cell.co2 > 10 : true;
      
      if (entity.timeSinceFed > entity.starvationResistance * 0.5 && !canBreathe) {
        entity.hibernating = true;
      }
      
      if (entity.hibernating && canBreathe && entity.timeSinceFed < entity.starvationResistance * 0.3) {
        entity.hibernating = false;
      }

      const activeMetabolism = entity.hibernating ? entity.metabolismRate * 0.1 : entity.metabolismRate;

      let fx = 0, fy = 0;

      if (!entity.hibernating) {
        // Movement based on LOCOMOTION blocks
        const hasLocomotion = entity.cellBlocks.some(b => b.type === 'LOCOMOTION');
        const movementMultiplier = hasLocomotion ? 1.0 : 0.3;

        // Hunting behavior for carnivores
        const hasCarnivoreEnzyme = entity.cellBlocks.some(b => b.type === 'CARNIVORE_ENZYME');
        if (hasCarnivoreEnzyme) {
          let closest = null, minDist = Infinity;
          
          for (let j = 0; j < entities.length; j++) {
            if (i === j) continue;
            const prey = entities[j];
            const dist = distance(entity.x, entity.y, prey.x, prey.y);
            if (dist < minDist && dist < 150) {
              minDist = dist;
              closest = prey;
            }
          }
          
          if (closest) {
            const dx = closest.x - entity.x;
            const dy = closest.y - entity.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
              fx += (dx / dist) * 0.3 * movementMultiplier;
              fy += (dy / dist) * 0.3 * movementMultiplier;
            }
            
            if (dist < archetype.size + 3) {
              entity.energy = Math.min(100, entity.energy + 35);
              entity.timeSinceFed = 0;
              
              for (let block of closest.cellBlocks) {
                blocks.push({
                  x: closest.x + (Math.random() - 0.5) * 10,
                  y: closest.y + (Math.random() - 0.5) * 10,
                  vx: (Math.random() - 0.5) * 0.5,
                  vy: (Math.random() - 0.5) * 0.5,
                  type: block.type,
                  free: true,
                  age: 0
                });
              }
              
              entities.splice(j, 1);
              if (j < i) i--;
            }
          }
        }

        // Random movement
        fx += (Math.random() - 0.5) * 0.08 * movementMultiplier;
        fy += (Math.random() - 0.5) * 0.08 * movementMultiplier;

        entity.vx += fx * params.speed;
        entity.vy += fy * params.speed;
        entity.vx *= 0.96;
        entity.vy *= 0.96;

        const speed = Math.sqrt(entity.vx ** 2 + entity.vy ** 2);
        const maxSpeed = archetype.speed * params.speed;
        if (speed > maxSpeed) {
          entity.vx = (entity.vx / speed) * maxSpeed;
          entity.vy = (entity.vy / speed) * maxSpeed;
        }

        entity.x += entity.vx;
        entity.y += entity.vy;

        if (entity.x < 0) entity.x = canvas.width;
        if (entity.x > canvas.width) entity.x = 0;
        if (entity.y < 0) entity.y = canvas.height;
        if (entity.y > canvas.height) entity.y = 0;
      }

      // Gas exchange
      if (canBreathe) {
        const hasChloroplast = entity.cellBlocks.some(b => b.type === 'CHLOROPLAST');
        const hasMitochondria = entity.cellBlocks.some(b => b.type === 'MITOCHONDRIA');
        
        if (hasAerobic) cell.oxygen -= activeMetabolism * 2;
        if (hasAquatic) cell.co2 -= activeMetabolism * 2;
        if (hasChloroplast) cell.oxygen += activeMetabolism * 3;
        if (hasMitochondria) cell.co2 += activeMetabolism * 3;
        
        entity.energy -= activeMetabolism;
      } else {
        entity.energy -= activeMetabolism * 2;
      }

      entity.timeSinceFed++;

      // Reproduction
      if (entity.energy > 75 && entity.timeSinceFed < 60 && Math.random() < 0.002) {
        const child = {
          ...entity,
          id: Math.random(),
          x: entity.x + (Math.random() - 0.5) * 20,
          y: entity.y + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          energy: 60,
          age: 0,
          timeSinceFed: 0,
          hibernating: false,
          starvationResistance: entity.starvationResistance + (Math.random() - 0.5) * 20,
          metabolismRate: entity.metabolismRate * (0.95 + Math.random() * 0.1),
          cellBlocks: entity.cellBlocks.map(b => ({...b}))
        };
        entity.energy = 50;
        entities.push(child);
      }

      entity.age++;

      if (entity.timeSinceFed > entity.starvationResistance && entity.energy <= 10) {
        for (let block of entity.cellBlocks) {
          blocks.push({
            x: entity.x + (Math.random() - 0.5) * 10,
            y: entity.y + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            type: block.type,
            free: true,
            age: 0
          });
        }
        entities.splice(i, 1);
      }
    }

    // Spontaneous block generation
    if (Math.random() < 0.05) {
      const blockTypes = Object.keys(BLOCK_TYPES);
      blocks.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        type: blockTypes[Math.floor(Math.random() * blockTypes.length)],
        free: true,
        age: 0
      });
    }

    // Update stats
    const typeCounts = {};
    const typeStats = {};
    let hibernating = 0, totalEnergy = 0, totalAge = 0;
    
    for (let e of entities) {
      typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
      if (e.hibernating) hibernating++;
      totalEnergy += e.energy;
      totalAge += e.age;
      
      if (!typeStats[e.type]) {
        typeStats[e.type] = { count: 0, avgEnergy: 0, avgAge: 0, avgStarvation: 0, avgMetabolism: 0 };
      }
      
      typeStats[e.type].count++;
      typeStats[e.type].avgEnergy += e.energy;
      typeStats[e.type].avgAge += e.age;
      typeStats[e.type].avgStarvation += e.starvationResistance;
      typeStats[e.type].avgMetabolism += e.metabolismRate;
    }
    
    for (let type in typeStats) {
      const count = typeStats[type].count;
      typeStats[type].avgEnergy = (typeStats[type].avgEnergy / count).toFixed(1);
      typeStats[type].avgAge = Math.floor(typeStats[type].avgAge / count);
      typeStats[type].avgStarvation = Math.floor(typeStats[type].avgStarvation / count);
      typeStats[type].avgMetabolism = (typeStats[type].avgMetabolism / count).toFixed(3);
    }
    
    setStats({
      ...typeCounts,
      typeStats,
      blocks: blocks.filter(b => b.free).length,
      hibernating,
      totalOrganisms: entities.length,
      avgEnergy: entities.length > 0 ? (totalEnergy / entities.length).toFixed(1) : 0,
      avgAge: entities.length > 0 ? Math.floor(totalAge / entities.length) : 0
    });
  };

  const drawRoundedShape = (ctx, shape, size, x, y, angle) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    switch(shape) {
      case 'capsule':
        // Elongated capsule with rounded ends
        ctx.beginPath();
        ctx.moveTo(-size * 0.8, 0);
        ctx.lineTo(size * 0.8, 0);
        ctx.arc(size * 0.8, 0, size * 0.4, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(-size * 0.8, size * 0.4);
        ctx.arc(-size * 0.8, 0, size * 0.4, Math.PI / 2, -Math.PI / 2);
        ctx.closePath();
        break;
        
      case 'rounded_rect':
        // Rounded rectangle
        const w = size * 1.2, h = size * 0.8, r = size * 0.25;
        ctx.beginPath();
        ctx.moveTo(-w/2 + r, -h/2);
        ctx.lineTo(w/2 - r, -h/2);
        ctx.quadraticCurveTo(w/2, -h/2, w/2, -h/2 + r);
        ctx.lineTo(w/2, h/2 - r);
        ctx.quadraticCurveTo(w/2, h/2, w/2 - r, h/2);
        ctx.lineTo(-w/2 + r, h/2);
        ctx.quadraticCurveTo(-w/2, h/2, -w/2, h/2 - r);
        ctx.lineTo(-w/2, -h/2 + r);
        ctx.quadraticCurveTo(-w/2, -h/2, -w/2 + r, -h/2);
        ctx.closePath();
        break;
        
      case 'rounded_triangle':
        // Triangle with rounded corners
        ctx.beginPath();
        const points = [
          [size, 0],
          [-size * 0.5, size * 0.8],
          [-size * 0.5, -size * 0.8]
        ];
        for (let i = 0; i < points.length; i++) {
          const curr = points[i];
          const next = points[(i + 1) % points.length];
          const prev = points[(i - 1 + points.length) % points.length];
          
          const dx1 = curr[0] - prev[0], dy1 = curr[1] - prev[1];
          const dx2 = next[0] - curr[0], dy2 = next[1] - curr[1];
          const len1 = Math.sqrt(dx1*dx1 + dy1*dy1), len2 = Math.sqrt(dx2*dx2 + dy2*dy2);
          
          const offset = size * 0.2;
          const p1x = curr[0] - (dx1/len1) * offset, p1y = curr[1] - (dy1/len1) * offset;
          const p2x = curr[0] + (dx2/len2) * offset, p2y = curr[1] + (dy2/len2) * offset;
          
          if (i === 0) ctx.moveTo(p1x, p1y);
          ctx.quadraticCurveTo(curr[0], curr[1], p2x, p2y);
          if (i < points.length - 1) ctx.lineTo(points[i+1][0] - (dx2/len2) * offset, points[i+1][1] - (dy2/len2) * offset);
        }
        ctx.closePath();
        break;
        
      case 'sharp_triangle':
        // More angular predator shape
        ctx.beginPath();
        ctx.moveTo(size * 1.2, 0);
        ctx.lineTo(-size * 0.6, size * 0.7);
        ctx.lineTo(-size * 0.3, 0);
        ctx.lineTo(-size * 0.6, -size * 0.7);
        ctx.closePath();
        break;
        
      default:
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2);
    }
    
    ctx.restore();
  };

  const render = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply camera transform
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-canvas.width / 2 + camera.x, -canvas.height / 2 + camera.y);

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const gasGrid = gasGridRef.current;
    
    // Draw gas grid
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
      
      const blockInfo = BLOCK_TYPES[block.type];
      ctx.beginPath();
      ctx.arc(block.x, block.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = blockInfo.color;
      ctx.fill();
      
      // Draw symbol on block
      ctx.fillStyle = '#000';
      ctx.font = '4px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(blockInfo.symbol, block.x, block.y);
    }

    // Draw organisms
    const entities = entitiesRef.current;
    
    // First draw building blocks inside cells
    for (let entity of entities) {
      for (let block of entity.cellBlocks) {
        const blockInfo = BLOCK_TYPES[block.type];
        const bx = entity.x + block.relX;
        const by = entity.y + block.relY;
        
        ctx.beginPath();
        ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = blockInfo.color;
        ctx.fill();
        
        // Draw symbol
        ctx.fillStyle = '#000';
        ctx.font = '3px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(blockInfo.symbol, bx, by);
      }
    }

    // Then draw cell membranes
    for (let entity of entities) {
      const archetype = entity.archetype;
      const opacity = entity.hibernating ? 0.5 : Math.max(0.7, entity.energy / 100);
      const angle = Math.atan2(entity.vy, entity.vx);
      
      ctx.strokeStyle = archetype.color + Math.floor(opacity * 255).toString(16).padStart(2, '0');
      ctx.lineWidth = 2.5;
      ctx.fillStyle = 'transparent';
      
      drawRoundedShape(ctx, archetype.shape, archetype.size, entity.x, entity.y, angle);
      ctx.stroke();

      // Hibernation indicator
      if (entity.hibernating) {
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(entity.x, entity.y, archetype.size + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  };

  const animate = () => {
    if (isRunning) {
      update();
    }
    render();
    animationRef.current = requestAnimationFrame(animate);
  };

  // Mouse/wheel handlers for zoom and pan
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = -e.deltaY * params.zoomSensitivity * 0.01;
    setCamera(prev => ({
      ...prev,
      zoom: Math.max(0.1, Math.min(5, prev.zoom + delta))
    }));
  };

  const handleMouseDown = (e) => {
    if (e.button === 0) { // Left click
      setCamera(prev => ({
        ...prev,
        isDragging: true,
        lastX: e.clientX,
        lastY: e.clientY
      }));
    }
  };

  const handleMouseMove = (e) => {
    if (camera.isDragging) {
      const dx = (e.clientX - camera.lastX) * params.panSensitivity;
      const dy = (e.clientY - camera.lastY) * params.panSensitivity;
      
      setCamera(prev => ({
        ...prev,
        x: prev.x + dx / prev.zoom,
        y: prev.y + dy / prev.zoom,
        lastX: e.clientX,
        lastY: e.clientY
      }));
    }
  };

  const handleMouseUp = () => {
    setCamera(prev => ({ ...prev, isDragging: false }));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Set canvas to 80% width (leave 20% for control panel)
    const width = container.offsetWidth * 0.8;
    const height = container.offsetHeight;
    
    canvas.width = width * 5;
    canvas.height = height * 5;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    
    initSimulation();
    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    initSimulation();
  }, [params.initialBlocks]);

  const resetCamera = () => {
    setCamera({ x: 0, y: 0, zoom: 1, isDragging: false, lastX: 0, lastY: 0 });
  };

  return (
    <div ref={containerRef} className="w-full h-screen bg-gray-900 flex">
      {/* Simulation Canvas - 80% width */}
      <div className="relative" style={{ width: '80%', height: '100vh' }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-move"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        
        {/* Camera controls overlay */}
        <div className="absolute top-4 left-4 bg-gray-800 bg-opacity-90 p-3 rounded-lg">
          <div className="flex items-center gap-2 text-white text-sm mb-2">
            <Move size={16} />
            <span>Click & Drag to Pan | Scroll to Zoom</span>
          </div>
          <div className="text-gray-400 text-xs">
            Zoom: {camera.zoom.toFixed(2)}x
          </div>
        </div>
      </div>

      {/* Control Panel - 20% width */}
      <div className="bg-gray-800 overflow-y-auto" style={{ width: '20%', height: '100vh' }}>
        <div className="p-6">
          <h1 className="text-xl font-bold text-white mb-6 border-b border-gray-700 pb-3">
            Ecosystem Controls
          </h1>

          {/* Simulation Controls */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">
              Simulation
            </h2>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setIsRunning(!isRunning)}
                className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2 transition-colors text-sm"
              >
                {isRunning ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play</>}
              </button>
              
              <button
                onClick={initSimulation}
                className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center justify-center gap-2 transition-colors text-sm"
              >
                <RotateCcw size={14} /> Reset
              </button>
            </div>
          </div>

          {/* Environment Parameters */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">
              Environment
            </h2>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <label>Building Blocks</label>
                  <span className="text-white font-mono">{params.initialBlocks}</span>
                </div>
                <input
                  type="range"
                  min="400"
                  max="1200"
                  value={params.initialBlocks}
                  onChange={(e) => setParams({ ...params, initialBlocks: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <label>Attraction Range</label>
                  <span className="text-white font-mono">{params.attractionRange}px</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="40"
                  value={params.attractionRange}
                  onChange={(e) => setParams({ ...params, attractionRange: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <label>Simulation Speed</label>
                  <span className="text-white font-mono">{params.speed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={params.speed}
                  onChange={(e) => setParams({ ...params, speed: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Camera Controls */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">
              Camera
            </h2>
            
            <div className="space-y-4 mb-3">
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <label>Zoom Sensitivity</label>
                  <span className="text-white font-mono">{params.zoomSensitivity.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.5"
                  step="0.05"
                  value={params.zoomSensitivity}
                  onChange={(e) => setParams({ ...params, zoomSensitivity: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <label>Pan Sensitivity</label>
                  <span className="text-white font-mono">{params.panSensitivity.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={params.panSensitivity}
                  onChange={(e) => setParams({ ...params, panSensitivity: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            <button
              onClick={resetCamera}
              className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center justify-center gap-2 transition-colors text-sm"
            >
              <ZoomOut size={14} /> Reset View
            </button>
          </div>

          {/* Statistics */}
          <div className="border-t border-gray-700 pt-6">
            <h2 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">
              Statistics
            </h2>

            {/* Overall Stats */}
            <div className="bg-gray-900 rounded-lg p-3 mb-4">
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Organisms:</span>
                  <span className="text-white font-mono">{stats.totalOrganisms || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Avg Energy:</span>
                  <span className="text-white font-mono">{stats.avgEnergy || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Avg Age:</span>
                  <span className="text-white font-mono">{stats.avgAge || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-400">Hibernating:</span>
                  <span className="text-white font-mono">{stats.hibernating || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-400">Free Blocks:</span>
                  <span className="text-white font-mono">{stats.blocks || 0}</span>
                </div>
              </div>
            </div>

            {/* Species Stats */}
            <div className="space-y-3">
              {Object.entries(stats).map(([type, count]) => {
                if (type === 'blocks' || type === 'hibernating' || type === 'totalOrganisms' || 
                    type === 'avgEnergy' || type === 'avgAge' || type === 'typeStats') return null;
                
                const archetype = ORGANISM_ARCHETYPES[type];
                const typeStatData = stats.typeStats?.[type];
                
                if (!archetype || !typeStatData) return null;
                
                return (
                  <div key={type} className="bg-gray-900 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold" style={{ color: archetype.color }}>
                        {archetype.name}
                      </span>
                      <span className="text-white font-mono text-sm">{count}</span>
                    </div>
                    <div className="space-y-1 text-xs text-gray-400">
                      <div className="flex justify-between">
                        <span>Energy:</span>
                        <span className="font-mono">{typeStatData.avgEnergy}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Age:</span>
                        <span className="font-mono">{typeStatData.avgAge}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Starvation:</span>
                        <span className="font-mono">{typeStatData.avgStarvation}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Metabolism:</span>
                        <span className="font-mono">{typeStatData.avgMetabolism}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EcosystemSimulator;
