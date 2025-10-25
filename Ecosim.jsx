import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

const EcosystemSimulator = () => {
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
    attractionRange: 12
  });

  const GRID_CELL_SIZE = 40;

  // Building block types
  const BLOCKS = {
    NUTRIENT: { color: '#84cc16', mass: 1 },
    CARBON: { color: '#78716c', mass: 1 },
    PROTEIN: { color: '#ec4899', mass: 1 }
  };

  // Entity recipes - what blocks are needed to form life
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

  const initGasGrid = (width, height) => {
    const cols = Math.ceil(width / GRID_CELL_SIZE);
    const rows = Math.ceil(height / GRID_CELL_SIZE);
    const grid = [];
    
    for (let y = 0; y < rows; y++) {
      grid[y] = [];
      for (let x = 0; x < cols; x++) {
        grid[y][x] = {
          oxygen: 50,
          co2: 50
        };
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

    // Initialize gas grid
    gasGridRef.current = initGasGrid(canvas.width, canvas.height);

    // Initialize building blocks scattered randomly
    const blocks = [];
    for (let i = 0; i < params.initialBlocks; i++) {
      const types = Object.keys(BLOCKS);
      const type = types[Math.floor(Math.random() * types.length)];
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

    // Start with no entities - they will form from building blocks
    entitiesRef.current = [];
  };

  const tryFormEntity = (blocks, canvas) => {
    // Check if any groups of blocks can form life
    for (let [entityType, recipe] of Object.entries(ENTITY_RECIPES)) {
      // Random chance for spontaneous formation
      if (Math.random() > 0.0005) continue;

      // Find a random starting block
      const startIdx = Math.floor(Math.random() * blocks.length);
      const startBlock = blocks[startIdx];
      
      // Find nearby blocks within attraction range
      const nearby = [];
      const range = 30;
      
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        
        // Only consider free blocks (not part of any cell)
        if (!block.free) continue;
        
        const dx = block.x - startBlock.x;
        const dy = block.y - startBlock.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < range) {
          nearby.push({ block, index: i });
        }
      }

      // Count available blocks by type
      const available = {};
      const indices = [];
      
      for (let item of nearby) {
        available[item.block.type] = (available[item.block.type] || 0) + 1;
        indices.push(item.index);
      }

      // Check if we have enough blocks to form this entity
      let canForm = true;
      for (let [blockType, amount] of Object.entries(recipe.requires)) {
        if ((available[blockType] || 0) < amount) {
          canForm = false;
          break;
        }
      }

      if (canForm) {
        // Create entity at center of blocks
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

        cx /= count;
        cy /= count;

        // Remove used blocks
        toRemove.sort((a, b) => b - a);
        for (let idx of toRemove) {
          blocks.splice(idx, 1);
        }

        // Create new entity (cell)
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
          cellBlocks: {...recipe.requires}, // Blocks contained in the cell
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

    const entities = entitiesRef.current;
    const blocks = buildingBlocksRef.current;
    const gasGrid = gasGridRef.current;

    // Diffuse gases in grid
    for (let y = 0; y < gasGrid.length; y++) {
      for (let x = 0; x < gasGrid[0].length; x++) {
        const cell = gasGrid[y][x];
        
        // Diffusion with neighbors
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
        
        // Natural equilibration
        cell.oxygen = Math.max(0, Math.min(100, cell.oxygen + (50 - cell.oxygen) * 0.001));
        cell.co2 = Math.max(0, Math.min(100, cell.co2 + (50 - cell.co2) * 0.001));
      }
    }

    // Update building blocks - slow random attraction
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      
      // Only free blocks can attract to other free blocks
      if (!block.free) continue;
      
      // Random slow attraction to nearby free blocks only
      if (Math.random() < 0.02) {
        for (let j = 0; j < blocks.length; j++) {
          if (i === j) continue;
          const other = blocks[j];
          
          // Only attract to other free blocks (not part of cells)
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
      
      // Wrap edges
      if (block.x < 0) block.x = canvas.width;
      if (block.x > canvas.width) block.x = 0;
      if (block.y < 0) block.y = canvas.height;
      if (block.y > canvas.height) block.y = 0;
      
      block.age++;
    }

    // Try to form new entities from building blocks
    const newEntity = tryFormEntity(blocks, canvas);
    if (newEntity) {
      entities.push(newEntity);
    }

    // Update entities
    for (let i = entities.length - 1; i >= 0; i--) {
      const entity = entities[i];
      const recipe = ENTITY_RECIPES[entity.type];
      const cell = getGridCell(entity.x, entity.y, gasGrid);
      
      if (!cell) continue;

      // Check if can breathe
      const canBreathe = recipe.consumes === 'OXYGEN' ? cell.oxygen > 10 : cell.co2 > 10;
      
      // Enter hibernation if starving and can't breathe well
      if (entity.timeSinceFed > entity.starvationResistance * 0.5 && !canBreathe) {
        entity.hibernating = true;
      }
      
      // Wake from hibernation if conditions improve
      if (entity.hibernating && canBreathe && entity.timeSinceFed < entity.starvationResistance * 0.3) {
        entity.hibernating = false;
      }

      const activeMetabolism = entity.hibernating ? entity.metabolismRate * 0.1 : entity.metabolismRate;

      let fx = 0, fy = 0;

      if (!entity.hibernating) {
        // Seek food
        let targetX = null, targetY = null;
        let minDist = Infinity;

        // Hunt prey
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

        // Move toward target
        if (targetX !== null) {
          const dx = targetX - entity.x;
          const dy = targetY - entity.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0) {
            fx += (dx / dist) * 0.2;
            fy += (dy / dist) * 0.2;
          }
        } else {
          // Seek better gas conditions
          const desiredGas = recipe.consumes === 'OXYGEN' ? 'oxygen' : 'co2';
          let bestDir = null;
          let bestValue = cell[desiredGas];
          
          for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            const checkX = entity.x + Math.cos(angle) * GRID_CELL_SIZE;
            const checkY = entity.y + Math.sin(angle) * GRID_CELL_SIZE;
            const checkCell = getGridCell(checkX, checkY, gasGrid);
            if (checkCell && checkCell[desiredGas] > bestValue) {
              bestValue = checkCell[desiredGas];
              bestDir = angle;
            }
          }
          
          if (bestDir !== null) {
            fx += Math.cos(bestDir) * 0.1;
            fy += Math.sin(bestDir) * 0.1;
          }
          
          // Random walk
          fx += (Math.random() - 0.5) * 0.05;
          fy += (Math.random() - 0.5) * 0.05;
        }

        entity.vx += fx * params.speed;
        entity.vy += fy * params.speed;
        entity.vx *= 0.96;
        entity.vy *= 0.96;

        const speed = Math.sqrt(entity.vx ** 2 + entity.vy ** 2);
        const maxSpeed = recipe.speed * params.speed;
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

      // Consume/produce gases
      if (canBreathe) {
        if (recipe.consumes === 'OXYGEN') {
          cell.oxygen -= activeMetabolism * 2;
        } else {
          cell.co2 -= activeMetabolism * 2;
        }
        
        if (recipe.produces === 'OXYGEN') {
          cell.oxygen += activeMetabolism * 3;
        } else {
          cell.co2 += activeMetabolism * 3;
        }
        
        entity.energy -= activeMetabolism;
      } else {
        entity.energy -= activeMetabolism * 2;
      }

      // Hunt and eat
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
              
              // Release prey's building blocks as free blocks
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

      if (!ate) {
        entity.timeSinceFed++;
      }

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
          cellBlocks: {...entity.cellBlocks},
          extensions: []
        };
        entity.energy = 50;
        entities.push(child);
      }

      entity.age++;

      // Die from starvation or complete energy depletion only
      if (entity.timeSinceFed > entity.starvationResistance && entity.energy <= 10) {
        // Release building blocks as free blocks
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
    
    for (let e of entities) {
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
    
    // Calculate averages
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

  const render = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const gasGrid = gasGridRef.current;
    
    // Draw gas grid (subtle)
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

    // Draw building blocks (only free ones are visible)
    const blocks = buildingBlocksRef.current;
    for (let block of blocks) {
      if (!block.free) continue;
      
      const blockInfo = BLOCKS[block.type];
      ctx.beginPath();
      ctx.arc(block.x, block.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = blockInfo.color;
      ctx.fill();
    }

    // Draw entities (cells) - draw building blocks inside cells first
    const entities = entitiesRef.current;
    for (let entity of entities) {
      const recipe = ENTITY_RECIPES[entity.type];
      
      // Draw building blocks that make up this cell
      let blockIdx = 0;
      for (let [blockType, amount] of Object.entries(entity.cellBlocks)) {
        const blockInfo = BLOCKS[blockType];
        for (let i = 0; i < amount; i++) {
          const angle = (Math.PI * 2 / Object.values(entity.cellBlocks).reduce((a,b) => a+b, 0)) * blockIdx;
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

    // Draw cell membranes (outlines only)
    for (let entity of entities) {
      const recipe = ENTITY_RECIPES[entity.type];
      const opacity = entity.hibernating ? 0.4 : Math.max(0.6, entity.energy / 100);
      
      ctx.save();
      ctx.translate(entity.x, entity.y);
      
      // Rotate for some shapes
      const angle = Math.atan2(entity.vy, entity.vx);
      
      // Draw cell membrane outline only
      ctx.strokeStyle = recipe.color + Math.floor(opacity * 255).toString(16).padStart(2, '0');
      ctx.lineWidth = 2;
      ctx.fillStyle = 'transparent';
      
      switch (recipe.cellShape) {
        case 'hexagon':
          // Hexagonal cell (Algae)
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
          
        case 'rod':
          // Rod-shaped cell (Bacteria)
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.ellipse(0, 0, recipe.size * 1.5, recipe.size * 0.6, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
          
        case 'oval':
          // Oval cell (Protozoa)
          ctx.beginPath();
          ctx.ellipse(0, 0, recipe.size * 1.2, recipe.size * 0.8, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
          
        case 'triangle':
          // Triangle cell (Predator)
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(recipe.size * 1.5, 0);
          ctx.lineTo(-recipe.size * 0.7, recipe.size * 0.9);
          ctx.lineTo(-recipe.size * 0.7, -recipe.size * 0.9);
          ctx.closePath();
          ctx.stroke();
          break;
          
        case 'irregular':
          // Irregular amoeba-like shape (Slime Mold)
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
          // Default circular
          ctx.beginPath();
          ctx.arc(0, 0, recipe.size, 0, Math.PI * 2);
          ctx.stroke();
      }

      // Hibernation indicator
      if (entity.hibernating) {
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, recipe.size + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();

      // Fractal extensions for slime mold
      if (entity.type === 'SLIME_MOLD' && !entity.hibernating && entity.energy > 50) {
        for (let i = 0; i < 4; i++) {
          const angle = (Math.PI * 2 / 4) * i + entity.age * 0.02;
          const len = 6 + Math.sin(entity.age * 0.05 + i) * 3;
          ctx.beginPath();
          ctx.moveTo(entity.x, entity.y);
          ctx.lineTo(
            entity.x + Math.cos(angle) * len,
            entity.y + Math.sin(angle) * len
          );
          ctx.strokeStyle = recipe.color + '80';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    // Draw stats
    ctx.fillStyle = 'white';
    ctx.font = '55px monospace';
    let y = 75;
    
    // Overall stats
    ctx.fillText('=== ECOSYSTEM ===', 50, y);
    y += 75;
    ctx.fillStyle = '#a3a3a3';
    ctx.fillText(`Total Organisms: ${stats.totalOrganisms || 0}`, 50, y);
    y += 65;
    ctx.fillText(`Avg Energy: ${stats.avgEnergy || 0}`, 50, y);
    y += 65;
    ctx.fillText(`Avg Age: ${stats.avgAge || 0}`, 50, y);
    y += 65;
    ctx.fillStyle = '#60a5fa';
    ctx.fillText(`Hibernating: ${stats.hibernating || 0}`, 50, y);
    y += 65;
    ctx.fillStyle = '#84cc16';
    ctx.fillText(`Free Blocks: ${stats.blocks || 0}`, 50, y);
    y += 100;
    
    // Species details
    ctx.fillStyle = 'white';
    ctx.fillText('=== SPECIES ===', 50, y);
    y += 75;
    
    for (let [type, count] of Object.entries(stats)) {
      if (type === 'blocks' || type === 'hibernating' || type === 'totalOrganisms' || 
          type === 'avgEnergy' || type === 'avgAge' || type === 'typeStats') continue;
      
      const recipe = ENTITY_RECIPES[type];
      const typeStatData = stats.typeStats?.[type];
      
      if (recipe && typeStatData) {
        ctx.fillStyle = recipe.color;
        ctx.fillText(`${recipe.name}: ${count || 0}`, 50, y);
        y += 65;
        ctx.fillStyle = '#a3a3a3';
        ctx.font = '50px monospace';
        ctx.fillText(`  Energy: ${typeStatData.avgEnergy}`, 50, y);
        y += 60;
        ctx.fillText(`  Age: ${typeStatData.avgAge}`, 50, y);
        y += 60;
        ctx.fillText(`  Starve: ${typeStatData.avgStarvation}`, 50, y);
        y += 60;
        ctx.fillText(`  Metab: ${typeStatData.avgMetabolism}`, 50, y);
        y += 75;
        ctx.font = '55px monospace';
      }
    }
  };

  const animate = () => {
    if (isRunning) {
      update();
    }
    render();
    animationRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

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

  return (
    <div className="w-full h-screen bg-gray-900 flex flex-col">
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <h1 className="text-2xl font-bold text-white mb-4">Cellular Life Formation Simulator</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-white text-sm block mb-1">
              Building Blocks: {params.initialBlocks}
            </label>
            <input
              type="range"
              min="400"
              max="1200"
              value={params.initialBlocks}
              onChange={(e) => setParams({ ...params, initialBlocks: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
          
          <div>
            <label className="text-white text-sm block mb-1">
              Attraction Range: {params.attractionRange}px
            </label>
            <input
              type="range"
              min="5"
              max="40"
              step="1"
              value={params.attractionRange}
              onChange={(e) => setParams({ ...params, attractionRange: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
          
          <div>
            <label className="text-white text-sm block mb-1">
              Speed: {params.speed.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              value={params.speed}
              onChange={(e) => setParams({ ...params, speed: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>
        
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-2"
          >
            {isRunning ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Play</>}
          </button>
          
          <button
            onClick={initSimulation}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded flex items-center gap-2"
          >
            <RotateCcw size={16} /> Reset
          </button>
        </div>
        
        <p className="text-gray-400 text-xs">
          Life forms spontaneously from building blocks. Cells contain their component blocks. Entities evolve starvation resistance through generations. 
          Blue glow = hibernation. Gas density (O₂/CO₂) shown as colored grid overlay.
        </p>
      </div>
      
      <canvas ref={canvasRef} className="flex-1 w-full mx-auto" style={{ maxWidth: '1200px', maxHeight: '1200px', aspectRatio: '1/1' }} />
    </div>
  );
};

export default EcosystemSimulator;
