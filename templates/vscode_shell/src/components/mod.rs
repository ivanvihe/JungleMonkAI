pub mod command_palette;
pub mod header;
pub mod main_content;
pub mod resource_panel;
pub mod sidebar;
pub mod split_panel;
pub mod status_bar;
pub mod tabs;
pub mod tree_view;

pub use command_palette::{
    draw_command_palette, Command, CommandPaletteModel, CommandPaletteProps,
};
pub use header::{draw_header, HeaderAction, HeaderModel, HeaderProps, SearchGroup, SearchResult};
pub use main_content::{
    draw_main_content, MainContentAction, MainContentModel, MainContentProps, MainContentTab,
};
pub use resource_panel::{
    draw_resource_panel, ResourceItem, ResourcePanelModel, ResourcePanelProps, ResourceSectionProps,
};
pub use sidebar::{draw_sidebar, NavigationModel, SidebarItem, SidebarProps, SidebarSection};
pub use split_panel::{
    draw_split_panel, PanelLeaf, PanelNode, PanelSplit, SplitDirection, SplitPanelModel,
    SplitPanelState,
};
pub use status_bar::{
    draw_status_bar, StatusBarItem, StatusBarModel, StatusBarProps,
    // Helper functions
    branch_item, encoding_item, eol_item, errors_item, language_item, 
    notifications_item, position_item, warnings_item,
};
pub use tabs::{draw_tabs, Tab, TabsModel, TabsProps};
pub use tree_view::{
    draw_tree_view, TreeNode, TreeNodeType, TreeViewModel, TreeViewProps,
    // Helper functions
    collect_all_ids, find_node_mut, tree_from_paths,
};
