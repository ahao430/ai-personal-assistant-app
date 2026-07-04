use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    #[serde(default = "default_size")]
    pub default_size: String,
    #[serde(default = "default_quality")]
    pub default_quality: String,
}

fn default_size() -> String {
    "1024x1024".into()
}
fn default_quality() -> String {
    "medium".into()
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenArgs {
    pub prompt: String,
    pub config: ImageConfig,
    #[serde(default)]
    pub size: Option<String>,
    #[serde(default)]
    pub quality: Option<String>,
    #[serde(default)]
    pub n: Option<u32>,
}
