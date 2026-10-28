//! Embedded font subsets (Latin + Latin-1, OFL). No system fonts: wasm-safe.

pub const INTER_REGULAR: &[u8] = include_bytes!("../fonts/Inter-Regular.ttf");
pub const INTER_SEMIBOLD: &[u8] = include_bytes!("../fonts/Inter-SemiBold.ttf");
pub const INTER_BOLD: &[u8] = include_bytes!("../fonts/Inter-Bold.ttf");
pub const GROTESK_BOLD: &[u8] = include_bytes!("../fonts/SpaceGrotesk-Bold.ttf");

/// SVG `font-family` names as stored in each subset's name table.
pub const FAMILY_REGULAR: &str = "Inter";
pub const FAMILY_SEMIBOLD: &str = "Inter SemiBold";
pub const FAMILY_FIGURE: &str = "Inter 28pt";
pub const FAMILY_BOLD: &str = "Space Grotesk";
