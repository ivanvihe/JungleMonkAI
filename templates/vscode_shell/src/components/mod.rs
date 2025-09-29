pub mod header;
pub mod main_content;
pub mod resource_panel;
pub mod sidebar;

pub use header::{draw_header, HeaderAction, HeaderModel, HeaderProps, SearchGroup, SearchResult};
pub use main_content::{
    draw_main_content, MainContentAction, MainContentModel, MainContentProps, MainContentTab,
};
pub use resource_panel::{
    draw_resource_panel, ResourceItem, ResourcePanelModel, ResourcePanelProps, ResourceSectionProps,
};
pub use sidebar::{draw_sidebar, NavigationModel, SidebarItem, SidebarProps, SidebarSection};
