@vertex
fn vs_main(@builtin(vertex_index) VertexIndex : u32) -> @builtin(position) vec4<f32> {
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );
    return vec4<f32>(pos[VertexIndex], 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = (pos.xy / vec2<f32>(800.0, 600.0)) * 2.0 - 1.0;
    var t = 0.0;
    var p: vec3<f32>;
    for (var i = 0; i < 32; i = i + 1) {
        p = vec3<f32>(uv, 0.0) + t * vec3<f32>(0.0, 0.0, 1.0);
        let d = length(p) - 0.5;
        if (d < 0.001) { break; }
        t = t + d;
    }
    let color = vec3<f32>(t / 4.0);
    return vec4<f32>(color, 1.0);
}
