use wgpu::Instance;

pub async fn init() {
    let instance = Instance::default();
    if let Some(adapter) = instance.request_adapter(&wgpu::RequestAdapterOptions::default()).await {
        let _ = adapter.request_device(&wgpu::DeviceDescriptor::default(), None).await;
    }
}
