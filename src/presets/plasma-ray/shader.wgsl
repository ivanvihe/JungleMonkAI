struct Uniforms {
    time: f32,
    audio_low: f32,
    audio_mid: f32,
    audio_high: f32,
    opacity: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Funcion de ruido para efectos electricos
fn electricNoise(p: vec2<f32>) -> f32 {
    let K1 = vec2<f32>(23.14069263277926, 2.665144142690225);
    return fract(cos(dot(p, K1)) * 12345.6789);
}

// Ruido turbulento para plasma
fn turbulentNoise(p: vec2<f32>, octaves: i32) -> f32 {
    var value = 0.0;
    var amplitude = 0.5;
    var frequency = 1.0;
    var p_var = p;
    
    for (var i = 0; i < octaves; i++) {
        value += amplitude * abs(electricNoise(p_var * frequency) * 2.0 - 1.0);
        frequency *= 2.0;
        amplitude *= 0.5;
        p_var = p_var * 1.1;
    }
    
    return value;
}

// Funcion para rayos electricos procedurales
fn lightningBolt(uv: vec2<f32>, start: vec2<f32>, end: vec2<f32>, time: f32, thickness: f32) -> f32 {
    let direction = end - start;
    let length = length(direction);
    let normalized_dir = direction / length;
    
    // Proyectar UV sobre la linea del rayo
    let to_point = uv - start;
    let projection = dot(to_point, normalized_dir);
    let t = clamp(projection / length, 0.0, 1.0);
    
    // Calcular punto mas cercano en la linea
    let closest_point = start + normalized_dir * projection;
    
    // Distancia perpendicular
    let perpendicular_dist = length(uv - closest_point);
    
    // Efecto zigzag del rayo
    let zigzag = sin(t * 20.0 + time * 10.0) * 0.1 * thickness;
    let randomness = electricNoise(vec2<f32>(t * 10.0, time)) * 0.05 * thickness;
    
    let total_thickness = thickness + abs(zigzag) + randomness;
    
    // Intensidad del rayo
    let bolt_intensity = exp(-perpendicular_dist / total_thickness);
    
    // Pulsacion del rayo
    let pulse = sin(time * 30.0 + t * 15.0) * 0.5 + 0.5;
    
    return bolt_intensity * pulse;
}

// Campo electrico radial
fn electricField(uv: vec2<f32>, center: vec2<f32>, time: f32, strength: f32) -> f32 {
    let dist = length(uv - center);
    let angle = atan2(uv.y - center.y, uv.x - center.x);
    
    // Campo radial pulsante
    let radial_field = strength / (1.0 + dist * dist);
    
    // Perturbaciones angulares
    let angular_noise = sin(angle * 8.0 + time * 3.0) * 0.3;
    let temporal_noise = cos(dist * 10.0 - time * 5.0) * 0.2;
    
    return radial_field * (1.0 + angular_noise + temporal_noise);
}

// Plasma dinamico
fn plasmaEffect(uv: vec2<f32>, time: f32, energy: f32) -> vec3<f32> {
    // Multiples capas de plasma
    let plasma1 = turbulentNoise(uv * 3.0 + vec2<f32>(time * 0.3, 0.0), 4);
    let plasma2 = turbulentNoise(uv * 5.0 + vec2<f32>(0.0, time * 0.5), 3);
    let plasma3 = turbulentNoise(uv * 8.0 + vec2<f32>(time * 0.7, time * 0.4), 2);
    
    // Combinar capas
    let combined_plasma = plasma1 * 0.5 + plasma2 * 0.3 + plasma3 * 0.2;
    
    // Colores del plasma basados en energia
    let core_color = vec3<f32>(0.0, 1.0, 1.0);      // Cyan
    let mid_color = vec3<f32>(0.0, 0.5, 1.0);       // Azul
    let edge_color = vec3<f32>(0.5, 0.0, 1.0);      // Purpura
    
    // Interpolacion de colores basada en intensidad
    var plasma_color: vec3<f32>;
    if (combined_plasma > 0.7) {
        plasma_color = mix(mid_color, core_color, (combined_plasma - 0.7) / 0.3);
    } else if (combined_plasma > 0.3) {
        plasma_color = mix(edge_color, mid_color, (combined_plasma - 0.3) / 0.4);
    } else {
        plasma_color = edge_color * (combined_plasma / 0.3);
    }
    
    return plasma_color * energy;
}

// Sistema de chispas
fn sparkSystem(uv: vec2<f32>, time: f32, intensity: f32) -> f32 {
    var sparks = 0.0;
    
    // Multiples chispas aleatorias
    for (var i = 0; i < 12; i++) {
        let spark_time = time + f32(i) * 0.3;
        let spark_id = f32(i) + 17.0;
        
        // Posicion de la chispa
        let spark_x = sin(spark_time * 2.0 + spark_id) * 1.5;
        let spark_y = cos(spark_time * 1.5 + spark_id * 1.3) * 1.0;
        let spark_pos = vec2<f32>(spark_x, spark_y);
        
        let dist_to_spark = length(uv - spark_pos);
        
        // Tamano variable de chispa
        let spark_size = 0.05 + sin(spark_time * 15.0) * 0.03;
        
        // Intensidad de la chispa con parpadeo
        let flicker = sin(spark_time * 25.0 + spark_id * 5.0) * 0.5 + 0.5;
        let spark_intensity = exp(-dist_to_spark / spark_size) * flicker;
        
        sparks += spark_intensity * 0.3;
    }
    
    return sparks * intensity;
}

// Nucleo de energia central
fn energyCore(uv: vec2<f32>, time: f32, power: f32) -> f32 {
    let dist = length(uv);
    
    // Nucleo pulsante
    let pulse_freq = 8.0;
    let pulse = sin(time * pulse_freq) * 0.3 + 0.7;
    
    // Intensidad del nucleo
    let core_size = 0.3 * pulse * power;
    let core_intensity = exp(-dist / core_size);
    
    // Anillos de energia
    let rings = sin(dist * 15.0 - time * 10.0) * 0.5 + 0.5;
    
    return core_intensity * (1.0 + rings * 0.3);
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
    let audio_intensity = (uniforms.audio_low + uniforms.audio_mid + uniforms.audio_high) / 3.0;
    
    // Color de fondo - azul oscuro energetico
    var background_color = vec3<f32>(0.0, 0.05, 0.1);
    
    // Nucleo de energia central
    let core_power = 1.0 + uniforms.audio_low * 2.0;
    let core = energyCore(uv, time, core_power);
    let core_color = vec3<f32>(0.0, 1.0, 1.0) * core; // Cyan brillante
    
    // Campo electrico
    let field_strength = uniforms.audio_low * 2.0;
    let electric_field = electricField(uv, vec2<f32>(0.0, 0.0), time, field_strength);
    let field_color = vec3<f32>(0.1, 0.3, 0.8) * electric_field * 0.3;
    
    // Rayos principales - multiples rayos dinamicos
    var lightning_intensity = 0.0;
    
    // Rayo principal vertical
    let main_bolt = lightningBolt(
        uv,
        vec2<f32>(0.0, -2.0),
        vec2<f32>(0.0, 2.0),
        time,
        0.1 + uniforms.audio_mid * 0.1
    );
    lightning_intensity += main_bolt;
    
    // Rayos radiales dinamicos
    for (var i = 0; i < 6; i++) {
        let angle = f32(i) * 1.047 + time * 0.5; // 60 grados entre rayos
        let ray_length = 1.5 + uniforms.audio_mid * 1.0;
        let end_point = vec2<f32>(
            cos(angle) * ray_length,
            sin(angle) * ray_length
        );
        
        let radial_bolt = lightningBolt(
            uv,
            vec2<f32>(0.0, 0.0),
            end_point,
            time + f32(i) * 0.3,
            0.05 + uniforms.audio_mid * 0.05
        );
        lightning_intensity += radial_bolt * 0.7;
    }
    
    // Color de los rayos - gradiente energetico
    let lightning_color = mix(
        vec3<f32>(0.0, 0.8, 1.0),  // Azul electrico
        vec3<f32>(1.0, 0.0, 1.0),  // Magenta alta energia
        uniforms.audio_high
    );
    
    // Efectos de plasma
    let plasma_energy = 0.5 + uniforms.audio_mid * 1.5;
    let plasma_colors = plasmaEffect(uv, time, plasma_energy);
    
    // Sistema de chispas
    let spark_intensity = sparkSystem(uv, time, uniforms.audio_high * 2.0);
    let spark_color = vec3<f32>(1.0, 1.0, 1.0) * spark_intensity;
    
    // Descargas secundarias en los bordes
    let edge_discharge = 0.0;
    let edge_dist = max(abs(uv.x) - 1.5, abs(uv.y) - 1.0);
    if (edge_dist > 0.0 && uniforms.audio_high > 0.6) {
        let discharge_noise = electricNoise(uv * 10.0 + time * 5.0);
        let discharge_intensity = exp(-edge_dist * 5.0) * discharge_noise;
        background_color += vec3<f32>(0.5, 0.0, 1.0) * discharge_intensity * 0.5;
    }
    
    // Combinar todos los efectos
    var final_color = background_color;
    final_color += core_color;
    final_color += field_color;
    final_color += lightning_color * lightning_intensity;
    final_color += plasma_colors * 0.4;
    final_color += spark_color;
    
    // Efectos de alta energia cuando el audio es intenso
    if (audio_intensity > 0.7) {
        let energy_burst = sin(time * 20.0) * 0.5 + 0.5;
        let burst_color = vec3<f32>(1.0, 0.5, 0.0) * energy_burst * (audio_intensity - 0.7);
        final_color += burst_color * 0.3;
    }
    
    // Pulsacion global sincronizada con audio
    let global_pulse = 0.7 + audio_intensity * 0.6;
    final_color *= global_pulse;
    
    // Efectos de sobrecarga en frecuencias altas
    let overload_effect = smoothstep(0.8, 1.0, uniforms.audio_high);
    if (overload_effect > 0.0) {
        let overload_flicker = sin(time * 50.0) * 0.5 + 0.5;
        final_color += vec3<f32>(1.0, 1.0, 1.0) * overload_effect * overload_flicker * 0.2;
    }
    
    // Vineta energetica
    let vignette_dist = length(uv * 0.8);
    let energy_vignette = 1.0 - smoothstep(0.5, 1.5, vignette_dist);
    final_color *= energy_vignette * 0.3 + 0.7;
    
    // Saturacion y contraste final
    final_color = pow(final_color, vec3<f32>(0.9)); // Gamma correction
    final_color = clamp(final_color, vec3<f32>(0.0), vec3<f32>(2.0)); // HDR clamp
    
    return vec4<f32>(final_color * uniforms.opacity, uniforms.opacity);
}