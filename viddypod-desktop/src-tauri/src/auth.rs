use anyhow::Result;
use keyring::Entry;

const SERVICE: &str = "viddypod";
const USER: &str = "agent_token";

pub fn save_token(token: &str) -> Result<()> {
    let entry = Entry::new(SERVICE, USER)?;
    entry.set_password(token)?;
    log::info!("Token saved to keychain");
    Ok(())
}

pub fn load_token() -> Result<String> {
    let entry = Entry::new(SERVICE, USER)?;
    let token = entry.get_password()?;
    Ok(token)
}

pub fn clear_token() -> Result<()> {
    let entry = Entry::new(SERVICE, USER)?;
    let _ = entry.delete_credential();
    log::info!("Token cleared from keychain");
    Ok(())
}
