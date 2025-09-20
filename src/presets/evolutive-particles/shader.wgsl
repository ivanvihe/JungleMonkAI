struct Uniforms {
    time: f32,
    audio_low: f32,
    audio_mid: f32,
    audio_high: f32,
    opacity: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Funcion de ruido 3D para efectos organicos
fn noise3D(p: vec3<f32>) -> f32 {
    let K = vec3<f32>(23.14069263277926, 2.665144142690225, 12.9898);
    return fract(cos(dot(p, K)) * 43758.5453);
}

// Ruido fractal para patrones complejos
fn fractalNoise(p: vec3<f32>, octaves: i32) -> f32 {
    var value = 0.0;
    var amplitude = 0.5;
    var frequency = 1.0;
    var p_var = p;
    
    for (var i = 0; i < octaves; i++) {
        value += amplitude * noise3D(p_var * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
        p_var = p_var * 1.1;
    }
    
    return value;
}

// Funcion para crear campos evolutivos
fn evolutionField(pos: vec3<f32>, time: f32, evolution_factor: f32) -> f32 {
    let slow_time = time * 0.3;
    let fast_time = time * 2.0;
    
    // Campo base que evoluciona lentamente
    let base_field = fractalNoise(pos + vec3<f32>(slow_time * 0.1), 4);
    
    // Mutaciones rapidas
    let mutation_field = noise3D(pos * 3.0 + vec3<f32>(fast_time * 0.5)) * evolution_factor;
    
    // Patrones emergentes
    let emergence = sin(pos.x * 4.0 + time) * cos(pos.y * 3.0 + time * 1.3) * sin(pos.z * 2.0 + time * 0.7);
    
    return base_field + mutation_field * 0.3 + emergence * 0.2;
}

// Sistema de atractores dinamicos
fn calculateAttractors(pos: vec2<f32>, time: f32) -> f32 {
    var attraction = 0.0;
    
    // Multiples atractores que se mueven
    for (var i = 0; i < 5; i++) {
        let offset = f32(i) * 2.1;
        let attractor_pos = vec2<f32>(
            sin(time * 0.3 + offset) * 2.0,
            cos(time * 0.2 + offset + 1.57) * 1.5
        );
        
        let distance = length(pos - attractor_pos);
        let strength = 1.0 / (1.0 + distance * distance);
        attraction += strength;
    }
    
    return attraction;
}

// Patron de conexiones dinamicas
fn connectionPattern(uv: vec2<f32>, time: f32, audio_intensity: f32) -> f32 {
    let grid_size = 8.0 + audio_intensity * 4.0;
    let grid_uv = uv * grid_size;
    let grid_id = floor(grid_uv);
    let grid_local = fract(grid_uv);
    
    // Crear conexiones entre puntos de la grilla
    let connection_strength = noise3D(vec3<f32>(grid_id, time * 0.5));
    
    // Lineas dinamicas que conectan celdas
    let line_x = smoothstep(0.45, 0.55, grid_local.x) * (1.0 - smoothstep(0.45, 0.55, grid_local.y));
    let line_y = smoothstep(0.45, 0.55, grid_local.y) * (1.0 - smoothstep(0.45, 0.55, grid_local.x));
    
    let lines = (line_x + line_y) * connection_strength;
    
    return lines * audio_intensity;
}

// Efecto de estelas de particulas
fn particleTrails(uv: vec2<f32>, time: f32) -> f32 {
    var trails = 0.0;
    
    // Multiples estelas que se mueven por el espacio
    for (var i = 0; i < 8; i++) {
        let trail_offset = f32(i) * 0.8;
        let trail_time = time + trail_offset;
        
        // Trayectoria de la estela
        let trail_x = sin(trail_time * 0.4 + trail_offset) * 1.5;
        let trail_y = cos(trail_time * 0.3 + trail_offset * 1.5) * 1.0;
        let trail_pos = vec2<f32>(trail_x, trail_y);
        
        let distance_to_trail = length(uv - trail_pos);
        let trail_width = 0.1 + sin(trail_time * 2.0) * 0.05;
        
        let trail_intensity = exp(-distance_to_trail / trail_width);
        trails += trail_intensity * 0.3;
    }
    
    return trails;
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );
    return vec4<f32>(pos[vertex_index], 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
    let resolution = vec2<f32>(800.0, 600.0);
    var uv = (frag_coord.xy / resolution) * 2.0 - 1.0;
    uv.x *= resolution.x / resolution.y;
    
    let time = uniforms.time;
    let audio_avg = (uniforms.audio_low + uniforms.audio_mid + uniforms.audio_high) / 3.0;
    
    // Color de fondo evolutivo
    let evolution_factor = uniforms.audio_mid * 2.0;
    let bg_field = evolutionField(vec3<f32>(uv * 0.5, time * 0.1), time, evolution_factor);
    
    var background_color = vec3<f32>(
        0.05 + bg_field * 0.1,
        0.08 + bg_field * 0.15,
        0.12 + bg_field * 0.2
    );
    
    // Atractores dinamicos
    let attractors = calculateAttractors(uv, time);
    background_color += vec3<f32>(0.1, 0.05, 0.15) * attractors * uniforms.audio_low;
    
    // Patron de conexiones
    let connections = connectionPattern(uv, time, audio_avg);
    let connection_color = vec3<f32>(0.4, 0.8, 0.6); // Verde suave para conexiones
    background_color = mix(background_color, connection_color, connections * 0.3);
    
    // Estelas de particulas
    let trails = particleTrails(uv, time);
    let trail_colors = vec3<f32>(
        0.8 + sin(time * 2.0) * 0.2,
        0.6 + cos(time * 1.5) * 0.3,
        0.9 + sin(time * 1.8) * 0.1
    );
    background_color += trail_colors * trails * uniforms.audio_high;
    
    // Efectos de emergencia en agudos altos
    if (uniforms.audio_high > 0.7) {
        let emergence_pulse = sin(time * 10.0) * 0.5 + 0.5;
        let emergence_pattern = fractalNoise(vec3<f32>(uv * 4.0, time), 3);
        background_color += vec3<f32>(0.3, 0.1, 0.4) * emergence_pulse * emergence_pattern;
    }
    
    // Pulso global basado en audio
    let global_pulse = 0.8 + audio_avg * 0.4;
    background_color *= global_pulse;
    
    // Vineta sutil
    let vignette = 1.0 - length(uv * 0.6);
    background_color *= vignette * 0.5 + 0.5;
    
    // Gradiente de edad/evolucion
    let age_gradient = length(uv) * 0.3;
    let age_colors = mix(
        vec3<f32>(1.0, 0.4, 0.6), // Rosa nacimiento
        vec3<f32>(0.3, 0.8, 0.8), // Azul maduro
        age_gradient
    );
    background_color = mix(background_color, age_colors, 0.1);
    
    return vec4<f32>(background_color * uniforms.opacity, uniforms.opacity);
}