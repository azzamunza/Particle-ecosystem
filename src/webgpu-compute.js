// WebGPU compute shader utilities for particle simulation

export class WebGPUCompute {
  constructor() {
    this.device = null;
    this.adapter = null;
    this.supported = false;
  }

  async initialize() {
    if (!navigator.gpu) {
      console.warn('WebGPU not supported, falling back to CPU');
      return false;
    }

    try {
      this.adapter = await navigator.gpu.requestAdapter();
      if (!this.adapter) {
        console.warn('WebGPU adapter not available');
        return false;
      }

      this.device = await this.adapter.requestDevice();
      this.supported = true;
      console.log('WebGPU initialized successfully');
      return true;
    } catch (error) {
      console.warn('Failed to initialize WebGPU:', error);
      return false;
    }
  }

  createBuffer(data, usage) {
    const buffer = this.device.createBuffer({
      size: data.byteLength,
      usage: usage,
      mappedAtCreation: true,
    });
    
    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
  }

  async readBuffer(buffer, size) {
    const readBuffer = this.device.createBuffer({
      size: size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const commandEncoder = this.device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(buffer, 0, readBuffer, 0, size);
    this.device.queue.submit([commandEncoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(readBuffer.getMappedRange()).slice();
    readBuffer.unmap();
    readBuffer.destroy();
    
    return result;
  }

  createParticleComputePipeline() {
    const shaderCode = `
      struct Particle {
        pos: vec2<f32>,
        vel: vec2<f32>,
        type: u32,
        free: u32,
        age: u32,
        padding: u32,
      }

      struct Params {
        numParticles: u32,
        canvasWidth: f32,
        canvasHeight: f32,
        speed: f32,
        attractionRange: f32,
        deltaTime: f32,
      }

      @group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
      @group(0) @binding(1) var<uniform> params: Params;

      @compute @workgroup_size(64)
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let index = global_id.x;
        if (index >= params.numParticles) {
          return;
        }

        var particle = particles[index];
        if (particle.free == 0u) {
          return;
        }

        // Attraction to nearby particles (with probability)
        // Using multiplicative hash with golden ratio constant for pseudo-random sampling
        let hash = (index * 2654435761u) % 100u;
        if (hash < 2u) {
          for (var i = 0u; i < params.numParticles; i++) {
            if (i == index) {
              continue;
            }
            
            let other = particles[i];
            if (other.free == 0u) {
              continue;
            }

            let dx = other.pos.x - particle.pos.x;
            let dy = other.pos.y - particle.pos.y;
            let dist = sqrt(dx * dx + dy * dy);

            if (dist < params.attractionRange && dist > 0.0) {
              particle.vel.x += (dx / dist) * 0.01;
              particle.vel.y += (dy / dist) * 0.01;
            }
          }
        }

        // Apply friction
        particle.vel.x *= 0.98;
        particle.vel.y *= 0.98;

        // Update position
        particle.pos.x += particle.vel.x * params.speed;
        particle.pos.y += particle.vel.y * params.speed;

        // Wrap around boundaries
        if (particle.pos.x < 0.0) {
          particle.pos.x = params.canvasWidth;
        }
        if (particle.pos.x > params.canvasWidth) {
          particle.pos.x = 0.0;
        }
        if (particle.pos.y < 0.0) {
          particle.pos.y = params.canvasHeight;
        }
        if (particle.pos.y > params.canvasHeight) {
          particle.pos.y = 0.0;
        }

        particle.age++;
        particles[index] = particle;
      }
    `;

    const shaderModule = this.device.createShaderModule({
      code: shaderCode,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    const pipeline = this.device.createComputePipeline({
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    return { pipeline, bindGroupLayout };
  }

  createGasGridComputePipeline() {
    const shaderCode = `
      struct GasCell {
        oxygen: f32,
        co2: f32,
      }

      struct Params {
        gridWidth: u32,
        gridHeight: u32,
      }

      // Diffusion constants
      const CELL_RETENTION: f32 = 0.95;
      const NEIGHBOR_INFLUENCE: f32 = 0.05;

      @group(0) @binding(0) var<storage, read> gasGridIn: array<GasCell>;
      @group(0) @binding(1) var<storage, read_write> gasGridOut: array<GasCell>;
      @group(0) @binding(2) var<uniform> params: Params;

      @compute @workgroup_size(8, 8)
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let x = global_id.x;
        let y = global_id.y;

        if (x >= params.gridWidth || y >= params.gridHeight) {
          return;
        }

        let index = y * params.gridWidth + x;
        var cell = gasGridIn[index];

        var oxygenDiff = 0.0;
        var co2Diff = 0.0;
        var neighbors = 0.0;

        // Diffusion with neighbors
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) {
              continue;
            }

            let nx = i32(x) + dx;
            let ny = i32(y) + dy;

            if (nx >= 0 && nx < i32(params.gridWidth) && ny >= 0 && ny < i32(params.gridHeight)) {
              let nIndex = u32(ny) * params.gridWidth + u32(nx);
              let neighbor = gasGridIn[nIndex];
              oxygenDiff += neighbor.oxygen;
              co2Diff += neighbor.co2;
              neighbors += 1.0;
            }
          }
        }

        if (neighbors > 0.0) {
          cell.oxygen = cell.oxygen * CELL_RETENTION + (oxygenDiff / neighbors) * NEIGHBOR_INFLUENCE;
          cell.co2 = cell.co2 * CELL_RETENTION + (co2Diff / neighbors) * NEIGHBOR_INFLUENCE;
        }

        // Equilibration toward 50
        cell.oxygen = cell.oxygen + (50.0 - cell.oxygen) * 0.001;
        cell.co2 = cell.co2 + (50.0 - cell.co2) * 0.001;

        // Clamp values
        cell.oxygen = clamp(cell.oxygen, 0.0, 100.0);
        cell.co2 = clamp(cell.co2, 0.0, 100.0);

        gasGridOut[index] = cell;
      }
    `;

    const shaderModule = this.device.createShaderModule({
      code: shaderCode,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    const pipeline = this.device.createComputePipeline({
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    return { pipeline, bindGroupLayout };
  }

  dispose() {
    if (this.device) {
      this.device.destroy();
    }
  }
}
